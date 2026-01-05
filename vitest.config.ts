import { defineConfig } from "vitest/config";

export default defineConfig({
  // Avoid reading root `.env` files during tests. Tests should be hermetic and
  // should not require local dev secrets/config to exist.
  // (Also helps in sandboxed environments where `.env` may be unreadable.)
  envDir: ".vitest-env",
  test: {
    globals: true,
    // Use threads to avoid forking child processes (some sandboxed/CI environments
    // restrict process termination syscalls, which can cause noisy shutdown errors).
    pool: "threads",
    include: ["packages/**/src/**/*.test.ts"],
  },
});
