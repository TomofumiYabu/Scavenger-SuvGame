import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// Cloud ships Chromium; GitHub Actions installs Playwright's managed browser.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    launchOptions: { executablePath: chromiumPath },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run preview",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "python3 tests/serve_static.py",
      url: "http://127.0.0.1:4174/Scavenger-SuvGame/",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
