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
  } catch {
    // Ignore cleanup errors
  }
  try {
    backendProcess?.kill();
  } catch {
    // Ignore cleanup errors
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

// --- API checklist (addition only): correlation ID + body echo ---
test("addition echoes x-correlation-id and includes it in body", async ({
  request,
}) => {
  const corr = "11111111-1111-4111-8111-111111111111";
  const r = await request.post("http://localhost:9999/api/calc", {
    headers: { "x-correlation-id": corr, "content-type": "application/json" },
    data: { op: "add", a: 2, b: 3 },
  });
  expect(r.status()).toBe(200);
  expect(r.headers()["x-correlation-id"]).toBe(corr);
  const j = await r.json();
  expect(j.result).toBe(5);
  expect(j.correlationId).toBe(corr);
});

// --- API checklist (addition only): Zod input validation ---
test("addition: Zod input validation returns 400 on bad input", async ({
  request,
}) => {
  const corr = "22222222-2222-4222-8222-222222222222";
  const r = await request.post(`http://localhost:9999/api/calc`, {
    headers: { "x-correlation-id": corr, "content-type": "application/json" },
    data: { op: "add", a: "1", b: 2 }, // 'a' wrong type on purpose
  });

  expect(r.status()).toBe(400);

  const j = await r.json();
  expect(j.error.code).toBe("BAD_INPUT");
  expect(Array.isArray(j.error.issues)).toBe(true);
  expect(j.correlationId).toBe(corr); // body includes corr id
  expect(r.headers()["x-correlation-id"]).toBe(corr); // header echoes corr id
});

// --- API checklist (subtraction): correlation ID + body echo ---
test("subtraction echoes x-correlation-id and includes it in body", async ({
  request,
}) => {
  const corr = "33333333-3333-4333-8333-333333333333";
  const r = await request.post("http://localhost:9999/api/calc", {
    headers: { "x-correlation-id": corr, "content-type": "application/json" },
    data: { op: "sub", a: 5, b: 2 },
  });
  expect(r.status()).toBe(200);
  expect(r.headers()["x-correlation-id"]).toBe(corr);
  const j = await r.json();
  expect(j.result).toBe(3);
  expect(j.correlationId).toBe(corr);
});

// --- API checklist (multiplication): correlation ID + body echo ---
test("multiplication echoes x-correlation-id and includes it in body", async ({
  request,
}) => {
  const corr = "44444444-4444-4444-8444-444444444444";
  const r = await request.post("http://localhost:9999/api/calc", {
    headers: { "x-correlation-id": corr, "content-type": "application/json" },
    data: { op: "mul", a: 5, b: 2 },
  });
  expect(r.status()).toBe(200);
  expect(r.headers()["x-correlation-id"]).toBe(corr);
  const j = await r.json();
  expect(j.result).toBe(10);
  expect(j.correlationId).toBe(corr);
});

// --- API checklist (subtraction): Zod input validation ---
test("subtraction: Zod input validation returns 400 on bad input", async ({
  request,
}) => {
  const corr = "55555555-5555-4555-8555-555555555555";
  const r = await request.post(`http://localhost:9999/api/calc`, {
    headers: { "x-correlation-id": corr, "content-type": "application/json" },
    data: { op: "sub", a: 1, b: "x" }, // 'b' wrong type
  });

  expect(r.status()).toBe(400);

  const j = await r.json();
  expect(j.error.code).toBe("BAD_INPUT");
  expect(Array.isArray(j.error.issues)).toBe(true);
  expect(j.correlationId).toBe(corr);
  expect(r.headers()["x-correlation-id"]).toBe(corr);
});

// --- API checklist (multiplication): Zod input validation ---
test("multiplication: Zod input validation returns 400 on bad input", async ({
  request,
}) => {
  const corr = "66666666-6666-4666-8666-666666666666";
  const r = await request.post(`http://localhost:9999/api/calc`, {
    headers: { "x-correlation-id": corr, "content-type": "application/json" },
    data: { op: "mul", a: "oops", b: 2 }, // 'a' wrong type
  });

  expect(r.status()).toBe(400);

  const j = await r.json();
  expect(j.error.code).toBe("BAD_INPUT");
  expect(Array.isArray(j.error.issues)).toBe(true);
  expect(j.correlationId).toBe(corr);
  expect(r.headers()["x-correlation-id"]).toBe(corr);
});

// --- API checklist: Unsupported op is rejected by Zod ---
test("unsupported op returns 400 with BAD_INPUT", async ({ request }) => {
  const corr = "77777777-7777-4777-8777-777777777777";
  const r = await request.post(`http://localhost:9999/api/calc`, {
    headers: { "x-correlation-id": corr, "content-type": "application/json" },
    data: { op: "div", a: 4, b: 2 }, // unsupported operation
  });

  expect(r.status()).toBe(400);

  const j = await r.json();
  expect(j.error.code).toBe("BAD_INPUT");
  expect(Array.isArray(j.error.issues)).toBe(true);
  expect(j.correlationId).toBe(corr);
  expect(r.headers()["x-correlation-id"]).toBe(corr);
});
