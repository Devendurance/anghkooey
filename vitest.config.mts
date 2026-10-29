import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Lets tests import route handlers that use the "@/…" path alias.
// videos/ holds film-evidence assets whose captions.test.mjs runs under
// plain node:test (see npm run test:captions), not vitest.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "videos/**", "tests/e2e/**"],
  },
});
