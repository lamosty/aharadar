import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from "fastify";
import { loadRuntimeEnv } from "@aharadar/shared";

const env = loadRuntimeEnv();

export function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const providedKey = request.headers["x-api-key"];

  if (!env.adminApiKey) {
    reply.code(500).send({
      ok: false,
      error: {
        code: "SERVER_CONFIG_ERROR",
        message: "ADMIN_API_KEY not configured",
      },
    });
    return;
  }

  if (!providedKey) {
    reply.code(401).send({
      ok: false,
      error: {
        code: "MISSING_API_KEY",
        message: "Missing X-API-Key header",
      },
    });
    return;
  }

  if (providedKey !== env.adminApiKey) {
    reply.code(401).send({
      ok: false,
      error: {
        code: "INVALID_API_KEY",
        message: "Invalid API key",
      },
    });
    return;
  }

  done();
}
