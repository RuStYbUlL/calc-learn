import { test, expect } from "@playwright/test";

const URL = "http://localhost:8080/api/calc";

test("500 returns structured JSON and echoes correlation id", async ({
  request,
}) => {
  const corr = "force500-" + Date.now();

  const r = await request.post(URL, {
    headers: {
      "content-type": "application/json",
      "x-correlation-id": corr,
      "x-force-500": "1", // <-- triggers the test hook
    },
    data: { op: "add", a: 1, b: 2 },
  });

  expect(r.status()).toBe(500);
  expect(r.headers()["x-correlation-id"]).toBe(corr);

  const j = await r.json();
  expect(j.correlationId).toBe(corr);
  expect(j.error).toBeDefined();
});
