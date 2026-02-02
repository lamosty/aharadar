import type { FastifyInstance } from "fastify";

const IS_DEV = process.env.NODE_ENV !== "production";

interface BypassQuery {
  role?: string;
  email?: string;
}

export async function devRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /dev/bypass
   * Dev-only endpoint to set auth bypass cookies and redirect to app
   */
  fastify.get<{ Querystring: BypassQuery }>("/dev/bypass", async (request, reply) => {
    if (!IS_DEV) {
      return reply.code(404).send({ ok: false, error: "Not found" });
    }

    const { role = "admin", email } = request.query;

    // Set bypass cookies
    reply.setCookie("BYPASS_AUTH", role, {
      path: "/",
      httpOnly: false, // Needs to be readable by client for some checks
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    if (email) {
      reply.setCookie("BYPASS_EMAIL", email, {
        path: "/",
        httpOnly: false,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    // Redirect to app
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    return reply.redirect(`${appUrl}/app`);
  });

  /**
   * POST /dev/bypass/clear
   * Clear bypass cookies
   */
  fastify.post("/dev/bypass/clear", async (_request, reply) => {
    if (!IS_DEV) {
      return reply.code(404).send({ ok: false, error: "Not found" });
    }

    reply.clearCookie("BYPASS_AUTH", { path: "/" });
    reply.clearCookie("BYPASS_EMAIL", { path: "/" });

    return { ok: true };
  });
}
