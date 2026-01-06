import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function stripInlineComment(value: string): string {
  // Treat " # ..." as a comment delimiter for unquoted values (common dotenv style).
  // Keep `#` when it's part of the value (no preceding whitespace).
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "#") {
      const prev = i > 0 ? value[i - 1] : "";
      if (prev === " " || prev === "\t") {
        return value.slice(0, i).trimEnd();
      }
    }
  }
  return value;
}

function parseEnvValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";

  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    // Support: KEY="value" # comment
    // Minimal escape handling: allow backslash-escaped quote inside.
    let out = "";
    let escaped = false;
    for (let i = 1; i < trimmed.length; i += 1) {
      const ch = trimmed[i]!;
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        return out;
      }
      out += ch;
    }
    // Unclosed quote: fall back to best-effort stripping inline comments.
    return stripInlineComment(trimmed);
  }

  return stripInlineComment(trimmed);
}

/**
 * Load environment variables from .env and .env.local files.
 * Does not override existing environment variables.
 * Should be called at the start of the application before using loadRuntimeEnv().
 */
export function loadDotEnvIfPresent(cwd: string = process.cwd()): void {
  for (const filename of [".env", ".env.local"]) {
    const fullPath = resolve(cwd, filename);
    if (!existsSync(fullPath)) continue;
    let raw: string;
    try {
      raw = readFileSync(fullPath, "utf8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`warning: failed to read ${filename}: ${message}`);
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = parseEnvValue(trimmed.slice(idx + 1));
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
