import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "../tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:8000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "cd .. && docker compose up -d --build",
    url: "http://localhost:8000/health",
    reuseExistingServer: true,
    timeout: 300_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
