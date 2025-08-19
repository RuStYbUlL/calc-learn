import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import { createServer } from "http";
import { readFileSync } from "fs";
import { join } from "path";

let backendProcess: any;
let frontendServer: any;

test.beforeAll(async () => {
  // Start backend server
  backendProcess = spawn("node", ["backend/dist/server.js"], {
    stdio: "pipe",
    cwd: process.cwd(),
  });

  // Start frontend server
  const frontendHtml = readFileSync(
    join(process.cwd(), "frontend/index.html"),
    "utf-8"
  );
  frontendServer = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(frontendHtml);
  });

  frontendServer.listen(3000);

  // Wait a bit for servers to start
  await new Promise((resolve) => setTimeout(resolve, 1000));
});

test.afterAll(async () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (frontendServer) {
    frontendServer.close();
  }
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
