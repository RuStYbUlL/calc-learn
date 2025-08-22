import { test, expect } from "@playwright/test";
import { postCalc } from "../helpers/api";
import { corr } from "../helpers/ids";

test("addition echoes x-correlation-id and includes it in body", async ({ request }) => {
  const c = corr("add");
  const r = await postCalc(request, { op: "add", a: 2, b: 3 }, { "x-correlation-id": c });
  expect(r.status()).toBe(200);
  expect(r.headers()["x-correlation-id"]).toBe(c);
  const j = await r.json();
  expect(j.result).toBe(5);
  expect(j.correlationId).toBe(c);
});

test("subtraction echoes x-correlation-id", async ({ request }) => {
  const c = corr("sub");
  const r = await postCalc(request, { op: "sub", a: 5, b: 2 }, { "x-correlation-id": c });
  expect(r.status()).toBe(200);
  expect(r.headers()["x-correlation-id"]).toBe(c);
  const j = await r.json();
  expect(j.result).toBe(3);
  expect(j.correlationId).toBe(c);
});

test("multiplication echoes x-correlation-id", async ({ request }) => {
  const c = corr("mul");
  const r = await postCalc(request, { op: "mul", a: 5, b: 2 }, { "x-correlation-id": c });
  expect(r.status()).toBe(200);
  expect(r.headers()["x-correlation-id"]).toBe(c);
  const j = await r.json();
  expect(j.result).toBe(10);
  expect(j.correlationId).toBe(c);
});

test("Zod: bad input returns 400 (add)", async ({ request }) => {
  const c = corr("bad-add");
  const r = await postCalc(
    request,
    { op: "add", a: "1" as any, b: 2 },
    { "x-correlation-id": c }
  );
  expect(r.status()).toBe(400);
  const j = await r.json();
  expect(j.error.code).toBe("BAD_INPUT");
  expect(Array.isArray(j.error.issues)).toBe(true);
  expect(j.correlationId).toBe(c);
  expect(r.headers()["x-correlation-id"]).toBe(c);
});

test("unsupported op is rejected by Zod", async ({ request }) => {
  const c = corr("bad-op");
  const r = await request.post("http://localhost:9999/api/calc", {
    headers: { "x-correlation-id": c, "content-type": "application/json" },
    data: { op: "div", a: 4, b: 2 }, // not allowed by schema
  });
  expect(r.status()).toBe(400);
  const j = await r.json();
  expect(j.error.code).toBe("BAD_INPUT");
  expect(Array.isArray(j.error.issues)).toBe(true);
  expect(j.correlationId).toBe(c);
  expect(r.headers()["x-correlation-id"]).toBe(c);
});
