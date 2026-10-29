import { defineConfig, devices } from "@playwright/test";

// QA browser suite. Runs against the scrubbed local server
// (QA_BASE_URL, default http://127.0.0.1:3100). Sequential: live Qloo
// calls stay bounded. Artifacts land in gitignored test-artifacts/.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  outputDir: "./test-artifacts/results",
  use: {
    baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
});
