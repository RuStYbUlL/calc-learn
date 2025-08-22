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
      timeout: 30000,
    },
    {
      command: "node scripts/static-frontend.js",
      port: 3000,
      reuseExistingServer: true,
      timeout: 10000,
    },
    {
      command: "node frontend/edge/dev-edge.js",
      port: 8080,
      reuseExistingServer: true,
      timeout: 10000,
    },
  ],
});
