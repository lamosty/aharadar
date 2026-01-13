export class TimeoutError extends Error {
  constructor(
    public readonly label: string,
    public readonly timeoutMs: number,
  ) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Race a promise against a timeout.
 *
 * NOTE: This does NOT cancel the underlying promise unless it is wired to an AbortSignal.
 * Prefer combining this with AbortController for fetch-based calls.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new TimeoutError(label, timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
