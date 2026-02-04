import { createLogger } from "@aharadar/shared";
import type { FastifyInstance } from "fastify";
import { generateToken, hashPassword, hashToken, verifyPassword } from "../auth/crypto.js";
import { getUserId, sessionAuth } from "../auth/session.js";
import { getDb } from "../lib/db.js";

const log = createLogger({ component: "auth" });

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const SESSION_EXPIRY_DAYS = 30;

interface RegisterBody {
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /auth/register
   * Create account with email and password
   */
  fastify.post<{ Body: RegisterBody }>("/auth/register", async (request, reply) => {
    const body = request.body as unknown;

    // Validate request body
    if (!body || typeof body !== "object") {
      return reply.code(400).send({
        ok: false,
        error: { code: "INVALID_REQUEST", message: "Invalid request body" },
      });
    }

    const { email, password } = body as { email?: unknown; password?: unknown };

    // Validate email
    if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      return reply.code(400).send({
        ok: false,
        error: { code: "INVALID_EMAIL", message: "Invalid email format" },
      });
    }

    // Validate password
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PASSWORD",
          message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      const db = getDb();

      // Check if user already exists
      const existingUser = await db.users.getByEmail(normalizedEmail);
      if (existingUser) {
        return reply.code(409).send({
          ok: false,
          error: { code: "USER_EXISTS", message: "An account with this email already exists" },
        });
      }

      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const user = await db.users.createWithPassword(normalizedEmail, passwordHash);

      log.info({ userId: user.id, email: normalizedEmail }, "User registered");

      // Create session
      const sessionToken = generateToken();
      const sessionHash = hashToken(sessionToken);
      const sessionExpiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      await db.sessions.create({
        userId: user.id,
        tokenHash: sessionHash,
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip,
        expiresAt: sessionExpiresAt,
      });

      // Set session cookie
      // Allow disabling secure cookies for internal HTTP access
      const secureCookies =
        process.env.SECURE_COOKIES !== "false" && process.env.NODE_ENV === "production";

      reply.setCookie("session", sessionToken, {
        path: "/",
        httpOnly: true,
        secure: secureCookies,
        sameSite: "lax",
        maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
      });

      return {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    } catch (err) {
      log.error({ err }, "Error during registration");
      return reply.code(500).send({
        ok: false,
        error: { code: "REGISTRATION_FAILED", message: "Failed to create account" },
      });
    }
  });

  /**
   * POST /auth/login
   * Login with email and password
   */
  fastify.post<{ Body: LoginBody }>("/auth/login", async (request, reply) => {
    const body = request.body as unknown;

    // Validate request body
    if (!body || typeof body !== "object") {
      return reply.code(400).send({
        ok: false,
        error: { code: "INVALID_REQUEST", message: "Invalid request body" },
      });
    }

    const { email, password } = body as { email?: unknown; password?: unknown };

    // Validate email
    if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      return reply.code(400).send({
        ok: false,
        error: { code: "INVALID_EMAIL", message: "Invalid email format" },
      });
    }

    // Validate password
    if (typeof password !== "string") {
      return reply.code(400).send({
        ok: false,
        error: { code: "INVALID_PASSWORD", message: "Password is required" },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      const db = getDb();

      // Get user with password hash
      const user = await db.users.getByEmailWithPassword(normalizedEmail);

      // Use generic error message to prevent email enumeration
      const invalidCredentialsError = {
        ok: false,
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
      };

      if (!user || !user.password_hash) {
        // User doesn't exist or has no password set
        // Still perform a dummy password check to prevent timing attacks
        await verifyPassword(password, "$2b$12$dummy.hash.to.prevent.timing.attacks");
        return reply.code(401).send(invalidCredentialsError);
      }

      // Verify password
      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        return reply.code(401).send(invalidCredentialsError);
      }

      log.info({ userId: user.id, email: normalizedEmail }, "User logged in");

      // Create session
      const sessionToken = generateToken();
      const sessionHash = hashToken(sessionToken);
      const sessionExpiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      await db.sessions.create({
        userId: user.id,
        tokenHash: sessionHash,
        userAgent: request.headers["user-agent"],
        ipAddress: request.ip,
        expiresAt: sessionExpiresAt,
      });

      // Set session cookie
      // Allow disabling secure cookies for internal HTTP access
      const secureCookies =
        process.env.SECURE_COOKIES !== "false" && process.env.NODE_ENV === "production";

      reply.setCookie("session", sessionToken, {
        path: "/",
        httpOnly: true,
        secure: secureCookies,
        sameSite: "lax",
        maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
      });

      return {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    } catch (err) {
      log.error({ err }, "Error during login");
      return reply.code(500).send({
        ok: false,
        error: { code: "LOGIN_FAILED", message: "Failed to log in" },
      });
    }
  });

  /**
   * POST /auth/logout
   * Invalidate current session
   */
  fastify.post("/auth/logout", async (request, reply) => {
    const sessionToken = request.cookies?.session;

    if (sessionToken) {
      const db = getDb();
      const tokenHash = hashToken(sessionToken);
      await db.sessions.deleteByTokenHash(tokenHash);
    }

    const isProduction = process.env.NODE_ENV === "production";

    // Clear cookie
    reply
      .clearCookie("session", {
        path: "/",
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
      })
      .send({ ok: true });
  });

  /**
   * GET /auth/me
   * Get current authenticated user
   */
  fastify.get("/auth/me", { preHandler: sessionAuth }, async (request, reply) => {
    const userId = getUserId(request);
    const db = getDb();

    const user = await db.users.getById(userId);
    if (!user) {
      return reply.code(404).send({
        ok: false,
        error: { code: "USER_NOT_FOUND", message: "User not found" },
      });
    }

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.created_at,
      },
    };
  });
}
