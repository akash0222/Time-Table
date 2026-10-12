import { defineConfig } from "@playwright/test";
import process from "node:process";

export default defineConfig({
  testDir: "./qa/e2e",
  testMatch: "**/*.spec.js",
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: "list",
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
