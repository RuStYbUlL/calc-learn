import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    headless: true //Tests run without opening a browser window
  },
  // Save screenshots on failure (handy for CI and PRs)
  reporter: [["list"], ["html", { outputFolder: "playwright-report" }]],
  testDir: "tests",
  timeout: 30_000
});
