import { test, expect } from "@playwright/test";
import { spawn, execSync } from "child_process";
import { createServer } from "http";
import { readFileSync } from "fs";
import { join } from "path";
// @ts-ignore
import waitOn from "wait-on";

let backendProcess: any;
let frontendServer: any;

test.beforeAll(async () => {
  // 1) Build the backend so backend/dist/server.js exists (CI-safe)
  execSync("pnpm run build", { stdio: "inherit" });

  // 2) Start backend with the same Node used by Playwright
  backendProcess = spawn(process.execPath, ["backend/dist/server.js"], {
    stdio: "pipe",
    cwd: process.cwd(),
  });

  // (optional) pipe backend logs to help debug CI failures
  backendProcess.stdout?.on("data", (d: Buffer) =>
    process.stdout.write(`[api] ${d}`)
  );
  backendProcess.stderr?.on("data", (d: Buffer) =>
    process.stderr.write(`[api] ${d}`)
  );

  // 3) Start a minimal static server for the single HTML file
  const frontendHtml = readFileSync(
    join(process.cwd(), "frontend/index.html"),
    "utf-8"
  );
  frontendServer = createServer((_, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(frontendHtml);
  });
  await new Promise<void>((r) => frontendServer.listen(3000, r));

  // 4) Wait until both services are actually reachable (no fixed sleep)
  await waitOn({
    resources: ["tcp:9999", "http://localhost:3000"],
    timeout: 30000,
    validateStatus: (status: number) => status >= 200 && status < 500, // 404 is still "up" for our static server
  });
});

test.afterAll(async () => {
  try {
    frontendServer?.close();
  } catch {}
  try {
    backendProcess?.kill();
  } catch {}
});

test("add: 2 + 3 = 5", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await page.fill("#a", "2");
  await page.selectOption("#op", "add");
  await page.fill("#b", "3");
  await page.click("#compute");

  const out = page.locator("#out");
  await expect(out).toContainText('"result": 5');

  await page.screenshot({ path: "test-artifacts/calc-add.png" });
});

test("sub: 5 - 2 = 3", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await page.fill("#a", "5");
  await page.selectOption("#op", "sub");
  await page.fill("#b", "2");
  await page.click("#compute");

  const out = page.locator("#out");
  await expect(out).toContainText('"result": 3');

  await page.screenshot({ path: "test-artifacts/calc-sub.png" });
});

test("mul: 5 * 2 = 10", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await page.fill("#a", "5");
  await page.selectOption("#op", "mul");
  await page.fill("#b", "2");
  await page.click("#compute");

  const out = page.locator("#out");
  await expect(out).toContainText('"result": 10');

  await page.screenshot({ path: "test-artifacts/calc-mul.png" });
});
