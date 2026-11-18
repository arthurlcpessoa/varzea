import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { DATABASE_URL: "file:./test.db", NODE_ENV: "test", JWT_SECRET: "test-secret" },
    globalSetup: ["./test/globalSetup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
