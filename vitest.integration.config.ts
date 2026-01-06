import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: ".vitest-env",
  test: {
    globals: true,
    // Integration tests may spawn containers which work better with forks
    pool: "forks",
    // Only include integration tests
    include: ["packages/**/src/**/*.int.test.ts"],
    // Longer timeout for container startup
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
