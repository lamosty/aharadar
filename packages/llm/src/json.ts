/**
 * Extract a JSON object from model output that may include code fences
 * or extra explanatory text.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();

  // Direct parse (common case)
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through to extraction
    }
  }

  // Try extracting from fenced code blocks
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  let lastMatch: string | null = null;
  for (const match of trimmed.matchAll(codeBlockRegex)) {
    const content = match[1].trim();
    if (content.startsWith("{")) {
      lastMatch = content;
    }
  }
  if (lastMatch) {
    try {
      const parsed = JSON.parse(lastMatch) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore and continue
    }
  }

  // Fallback: find the outermost JSON object
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }

  return null;
}
