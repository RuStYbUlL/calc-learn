import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: 0,
  webServer: [
    {
      command: "pnpm run build && node backend/dist/server.js",
      port: 9999,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      // serves /frontend at http://localhost:3000
      command: "npx http-server frontend -p 3000 -a 127.0.0.1 --silent",
      port: 3000,
      reuseExistingServer: true,
      timeout: 10_000,
    },
  ],
});
