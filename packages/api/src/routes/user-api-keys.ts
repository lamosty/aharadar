import type { FastifyInstance } from "fastify";
import { encryptApiKey, getMasterKey, getKeySuffix } from "../auth/crypto.js";
import { getDb, getSingletonContext } from "../lib/db.js";
import { createLogger } from "@aharadar/shared";

const log = createLogger({ component: "user-api-keys" });

// Supported providers
const PROVIDERS = ["openai", "anthropic", "xai"] as const;
type Provider = (typeof PROVIDERS)[number];

interface AddKeyBody {
  provider: string;
  apiKey: string;
}

interface KeyResponse {
  id: string;
  provider: string;
  keySuffix: string;
  createdAt: string;
  updatedAt: string;
}

interface ProviderStatus {
  provider: string;
  hasUserKey: boolean;
  keySuffix: string | null;
  hasSystemFallback: boolean;
  activeSource: "user" | "system" | "none";
}

const PROVIDER_ENV_MAP: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  xai: "XAI_API_KEY",
};

export async function userApiKeysRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /user/api-keys
   * List user's configured API keys (suffix only, never full key)
   */
  fastify.get("/user/api-keys", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: { code: "NOT_INITIALIZED", message: "Database not initialized" },
      });
    }

    const db = getDb();
    const keys = await db.userApiKeys.listByUser(ctx.userId);

    const response: KeyResponse[] = keys.map((k) => ({
      id: k.id,
      provider: k.provider,
      keySuffix: k.key_suffix,
      createdAt: k.created_at,
      updatedAt: k.updated_at,
    }));

    return { ok: true, keys: response };
  });

  /**
   * POST /user/api-keys
   * Add or update an API key for a provider
   */
  fastify.post<{ Body: AddKeyBody }>("/user/api-keys", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: { code: "NOT_INITIALIZED", message: "Database not initialized" },
      });
    }

    const { provider, apiKey } = request.body ?? {};

    // Validate provider
    if (!provider || !PROVIDERS.includes(provider as Provider)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_PROVIDER",
          message: `Provider must be one of: ${PROVIDERS.join(", ")}`,
        },
      });
    }

    // Validate API key
    if (!apiKey || typeof apiKey !== "string" || apiKey.length < 10 || apiKey.length > 500) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "INVALID_API_KEY",
          message: "API key must be between 10 and 500 characters",
        },
      });
    }

    try {
      const masterKey = getMasterKey();
      const { encrypted, iv } = encryptApiKey(apiKey, masterKey);
      const keySuffix = getKeySuffix(apiKey, 4);

      const db = getDb();
      const result = await db.userApiKeys.upsert(ctx.userId, provider, encrypted, iv, keySuffix);

      log.info({ provider, userId: ctx.userId }, "API key stored");

      return {
        ok: true,
        key: {
          id: result.id,
          provider: result.provider,
          keySuffix: result.key_suffix,
          createdAt: result.created_at,
          updatedAt: result.updated_at,
        },
      };
    } catch (error) {
      log.error({ error, provider }, "Failed to store API key");

      // Check for missing encryption key
      if (error instanceof Error && error.message.includes("APP_ENCRYPTION_KEY")) {
        return reply.code(500).send({
          ok: false,
          error: {
            code: "ENCRYPTION_NOT_CONFIGURED",
            message: "Server encryption is not configured",
          },
        });
      }

      return reply.code(500).send({
        ok: false,
        error: { code: "STORAGE_FAILED", message: "Failed to store API key" },
      });
    }
  });

  /**
   * DELETE /user/api-keys/:id
   * Remove an API key
   */
  fastify.delete<{ Params: { id: string } }>("/user/api-keys/:id", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: { code: "NOT_INITIALIZED", message: "Database not initialized" },
      });
    }

    const { id } = request.params;

    const db = getDb();
    const deleted = await db.userApiKeys.delete(ctx.userId, id);

    if (!deleted) {
      return reply.code(404).send({
        ok: false,
        error: { code: "NOT_FOUND", message: "Key not found" },
      });
    }

    log.info({ keyId: id, userId: ctx.userId }, "API key deleted");

    return { ok: true };
  });

  /**
   * GET /user/api-keys/status
   * Get key source status for each provider
   */
  fastify.get("/user/api-keys/status", async (request, reply) => {
    const ctx = await getSingletonContext();
    if (!ctx) {
      return reply.code(503).send({
        ok: false,
        error: { code: "NOT_INITIALIZED", message: "Database not initialized" },
      });
    }

    const db = getDb();
    const keys = await db.userApiKeys.listByUser(ctx.userId);
    const allowFallback = process.env.ALLOW_SYSTEM_KEY_FALLBACK === "true";

    const status: ProviderStatus[] = PROVIDERS.map((provider) => {
      const userKey = keys.find((k) => k.provider === provider);
      const envVar = PROVIDER_ENV_MAP[provider];
      const hasSystemKey = !!process.env[envVar];

      let activeSource: "user" | "system" | "none" = "none";
      if (userKey) {
        activeSource = "user";
      } else if (allowFallback && hasSystemKey) {
        activeSource = "system";
      }

      return {
        provider,
        hasUserKey: !!userKey,
        keySuffix: userKey?.key_suffix ?? null,
        hasSystemFallback: allowFallback && hasSystemKey,
        activeSource,
      };
    });

    return { ok: true, status };
  });
}
