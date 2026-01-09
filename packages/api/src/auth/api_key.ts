import { loadRuntimeEnv, type RuntimeEnv } from "@aharadar/shared";
import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";

let _env: RuntimeEnv | null = null;
function getEnv(): RuntimeEnv {
  if (!_env) _env = loadRuntimeEnv();
  return _env;
}

export function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  const env = getEnv();
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
