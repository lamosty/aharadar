export interface CodedLlmError extends Error {
  code?: string;
}

const AUTH_ERROR_PATTERNS: RegExp[] = [
  /could not resolve authentication method/i,
  /expected either apikey or authtoken to be set/i,
  /invalid api key/i,
  /api key.*required/i,
  /missing.*api key/i,
  /auth token/i,
  /authorization header:\s*false/i,
  /authentication failed/i,
  /unauthorized/i,
  /forbidden/i,
  /not logged in/i,
  /please run .*login/i,
  /login required/i,
];

function normalizeError(error: unknown): CodedLlmError {
  if (error instanceof Error) {
    return error as CodedLlmError;
  }
  return new Error(String(error)) as CodedLlmError;
}

export function isLlmAuthLikeMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function classifyLlmProviderError(error: unknown): CodedLlmError {
  const err = normalizeError(error);
  const currentCode = typeof err.code === "string" ? err.code : null;
  if (currentCode === "LLM_AUTH_ERROR") {
    return err;
  }

  if (isLlmAuthLikeMessage(err.message)) {
    err.code = "LLM_AUTH_ERROR";
    err.message =
      "LLM authentication failed. Re-login for the selected provider or switch to an API-key provider.";
  }

  return err;
}

export function isLlmAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "LLM_AUTH_ERROR") return true;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") return false;
  return isLlmAuthLikeMessage(message);
}
