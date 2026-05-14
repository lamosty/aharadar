import http from "node:http";
import {
  type CodexLocalBridgeRequest,
  type CodexLocalBridgeResponse,
  callCodexSubscriptionDirect,
  type LlmRequest,
  type ModelRef,
} from "@aharadar/llm";
import { createLogger, loadDotEnvIfPresent } from "@aharadar/shared";

loadDotEnvIfPresent();

const log = createLogger({ component: "codex-host" });

const HOST = process.env.CODEX_HOST_BIND ?? "127.0.0.1";
const PORT = Number.parseInt(process.env.CODEX_HOST_PORT ?? "43117", 10);
const TOKEN = process.env.CODEX_HOST_TOKEN ?? process.env.CODEX_LOCAL_TOKEN;
const MAX_BODY_BYTES = Number.parseInt(process.env.CODEX_HOST_MAX_BODY_BYTES ?? "2000000", 10);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseReasoningEffort(value: unknown): LlmRequest["reasoningEffort"] | undefined {
  if (typeof value !== "string") return undefined;
  if (value === "none" || value === "low" || value === "medium" || value === "high") {
    return value;
  }
  if (value === "xhigh") return value;
  return undefined;
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  body: CodexLocalBridgeResponse | { ok: true; service: string },
): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function sendError(
  res: http.ServerResponse,
  statusCode: number,
  code: string,
  message: string,
): void {
  sendJson(res, statusCode, { ok: false, error: { code, message } });
}

function isAuthorized(req: http.IncomingMessage): boolean {
  if (!TOKEN) return true;
  const header = req.headers.authorization;
  if (header === `Bearer ${TOKEN}`) return true;
  return req.headers["x-aharadar-codex-token"] === TOKEN;
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error(`Request body too large (max ${MAX_BODY_BYTES} bytes)`);
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeBridgeRequest(body: unknown): {
  ref: ModelRef;
  request: LlmRequest;
} {
  if (!isRecord(body)) {
    throw new Error("Request body must be a JSON object");
  }

  const model = asString(body.model) ?? process.env.CODEX_MODEL;
  const system = asString(body.system);
  const user = asString(body.user);

  if (!model) throw new Error("model is required");
  if (!system) throw new Error("system is required");
  if (!user) throw new Error("user is required");

  const jsonSchema = isRecord(body.jsonSchema)
    ? (body.jsonSchema as Record<string, unknown>)
    : undefined;

  // @constraint This bridge intentionally does not log prompts or auth state.
  // It only normalizes a generic Aha Radar LLM request and executes Codex as
  // the logged-in host user, keeping subscription credentials out of Docker.
  const request: LlmRequest = {
    system,
    user,
    reasoningEffort: parseReasoningEffort(body.reasoningEffort),
    maxOutputTokens: asOptionalNumber(body.maxOutputTokens),
    temperature: asOptionalNumber(body.temperature),
    jsonSchema,
  };

  return {
    ref: {
      provider: "codex-subscription",
      model,
      endpoint: "codex-host",
    },
    request,
  };
}

async function handleLlm(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!isAuthorized(req)) {
    sendError(res, 401, "UNAUTHORIZED", "Codex host token is missing or invalid");
    return;
  }

  let parsedBody: unknown;
  try {
    parsedBody = await readJsonBody(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 400, "INVALID_JSON", message);
    return;
  }

  let normalized: ReturnType<typeof normalizeBridgeRequest>;
  try {
    normalized = normalizeBridgeRequest(parsedBody as CodexLocalBridgeRequest);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendError(res, 400, "INVALID_REQUEST", message);
    return;
  }

  try {
    const result = await callCodexSubscriptionDirect(normalized.ref, normalized.request, {
      workingDirectory: process.env.CODEX_HOST_WORKDIR,
    });

    sendJson(res, 200, {
      ok: true,
      outputText: result.outputText,
      provider: "codex-subscription",
      model: normalized.ref.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      structuredOutput: result.structuredOutput,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ err: message, model: normalized.ref.model }, "Codex request failed");
    sendError(res, 502, "CODEX_CALL_FAILED", message);
  }
}

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";

  if (req.method === "GET" && url === "/healthz") {
    sendJson(res, 200, { ok: true, service: "aharadar-codex-host" });
    return;
  }

  if (req.method === "POST" && url === "/v1/llm") {
    void handleLlm(req, res);
    return;
  }

  sendError(res, 404, "NOT_FOUND", "Not found");
});

server.listen(PORT, HOST, () => {
  log.info(
    {
      host: HOST,
      port: PORT,
      tokenAuth: !!TOKEN,
    },
    "Codex host bridge listening",
  );
});

function shutdown(signal: string): void {
  log.info({ signal }, "Shutting down Codex host bridge");
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
