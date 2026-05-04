import { defineConfig, devices } from "@playwright/test";

const nextPort = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const searchPort = Number(process.env.PLAYWRIGHT_SEARCH_PORT ?? 8080);
const baseURL = `http://localhost:${nextPort}`;
const searchServiceUrl = `http://127.0.0.1:${searchPort}/api/search`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : [["line"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm run search-service",
      url: `http://127.0.0.1:${searchPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        PORT: String(searchPort),
        HOST: "127.0.0.1",
        DATABASE_URL: "",
        SEARCH_ANSWER_MODE: "extractive",
        SEARCH_SERVICE_PROVIDER: "seed",
      },
    },
    {
      command: "npm run dev",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: String(nextPort),
        SEARCH_SERVICE_URL: searchServiceUrl,
        SEARCH_SERVICE_METHOD: "POST",
        SEARCH_SERVICE_LIMIT: "6",
        SEARCH_SERVICE_TIMEOUT_MS: "8000",
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
