import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createLogger } from "@aharadar/shared";
import { getDb } from "../lib/db.js";
import { sendMagicLinkEmail } from "../lib/email.js";
import { generateToken, hashToken } from "../auth/crypto.js";
import { sessionAuth, getUserId } from "../auth/session.js";

const log = createLogger({ component: "auth" });

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAGIC_LINK_EXPIRY_MINUTES = 15;
const SESSION_EXPIRY_DAYS = 30;
const IS_DEV = process.env.NODE_ENV !== "production";

interface SendLinkBody {
  email: string;
}

interface VerifyQuery {
  token: string;
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /auth/send-link
   * Send magic link email to user
   */
  fastify.post<{ Body: SendLinkBody }>("/auth/send-link", async (request, reply) => {
    const body = request.body as unknown;

    // Validate email
    if (!body || typeof body !== "object" || !("email" in body)) {
      return reply.code(400).send({
        ok: false,
        error: { code: "INVALID_REQUEST", message: "Email is required" },
      });
    }

    const { email } = body as { email: unknown };
    if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
      return reply.code(400).send({
        ok: false,
        error: { code: "INVALID_EMAIL", message: "Invalid email format" },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      const db = getDb();

      // Get or create user by email
      const user = await db.users.getOrCreateByEmail(normalizedEmail);

      // Generate magic link token
      const token = generateToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

      // Store token hash in database
      await db.authTokens.create({
        userId: user.id,
        tokenHash,
        purpose: "magic_link",
        expiresAt,
      });

      // Send email with magic link (or skip in dev mode if Resend not configured)
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const verifyUrl = `${appUrl}/verify?token=${encodeURIComponent(token)}`;

      // In dev mode without RESEND_API_KEY, return token directly for testing
      if (IS_DEV && !process.env.RESEND_API_KEY) {
        log.info({ email: normalizedEmail, verifyUrl }, "DEV MODE: Magic link generated");
        return {
          ok: true,
          message: "Dev mode: Check console or use the returned verifyUrl",
          // Only exposed in dev mode for testing/Playwright
          _dev: {
            token,
            verifyUrl,
          },
        };
      }

      await sendMagicLinkEmail({ to: normalizedEmail, token, appUrl });

      // In dev mode with Resend configured, still return verifyUrl for convenience
      if (IS_DEV) {
        log.info({ email: normalizedEmail, verifyUrl }, "Magic link sent");
        return {
          ok: true,
          message: "Magic link sent! Check your email.",
          // Only exposed in dev mode for testing/Playwright
          _dev: {
            verifyUrl,
          },
        };
      }

      // Production: Never expose token or URL
      return { ok: true, message: "If this email exists, a login link has been sent" };
    } catch (err) {
      log.error({ err }, "Error sending magic link");
      // Still return success to prevent email enumeration
      return { ok: true, message: "If this email exists, a login link has been sent" };
    }
  });

  /**
   * GET /auth/verify
   * Verify magic link token and create session
   */
  fastify.get<{ Querystring: VerifyQuery }>("/auth/verify", async (request, reply) => {
    const { token } = request.query as { token?: string };

    if (!token || typeof token !== "string") {
      return reply.code(400).send({
        ok: false,
        error: { code: "INVALID_REQUEST", message: "Token is required" },
      });
    }

    const db = getDb();
    const tokenHash = hashToken(token);

    // Find valid (unused, not expired) token
    const authToken = await db.authTokens.getValidByHash(tokenHash);

    if (!authToken) {
      // Redirect to login with error
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      return reply.redirect(`${appUrl}/login?error=invalid_token`);
    }

    // Mark token as used
    await db.authTokens.markUsed(authToken.id);

    // Create session
    const sessionToken = generateToken();
    const sessionHash = hashToken(sessionToken);
    const sessionExpiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await db.sessions.create({
      userId: authToken.user_id,
      tokenHash: sessionHash,
      userAgent: request.headers["user-agent"],
      ipAddress: request.ip,
      expiresAt: sessionExpiresAt,
    });

    // Set session cookie and redirect to app
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const isProduction = process.env.NODE_ENV === "production";

    reply
      .setCookie("session", sessionToken, {
        path: "/",
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60, // seconds
      })
      .redirect(`${appUrl}/app`);
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
