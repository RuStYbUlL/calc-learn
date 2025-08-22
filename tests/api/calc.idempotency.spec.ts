// tests/api/calc.idempotency.spec.ts
import { test, expect } from "@playwright/test";

const URL = "http://localhost:8080/api/calc"; // or 9999 if you prefer to hit origin directly

function key(suffix: string) {
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}-${suffix}`;
}

function bucket(suffix: string) {
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}-${suffix}`;
}

test.describe("Idempotency", () => {
  test("replays same response for same Idempotency-Key & same body", async ({
    request,
  }) => {
    const idem = key("same-body");
    const rlBucket = bucket("same-body");
    const body = { op: "add" as const, a: 1, b: 2 };

    const r1 = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "idem-1",
        "idempotency-key": idem,
        "x-rate-bucket": rlBucket,
      },
      data: body,
    });
    expect(r1.status()).toBe(200);
    expect(r1.headers()["idempotency-replayed"]).toBe("false");
    const j1 = await r1.json();

    const r2 = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "idem-2",
        "idempotency-key": idem,
        "x-rate-bucket": rlBucket,
      },
      data: body,
    });
    expect(r2.status()).toBe(200);
    expect(r2.headers()["idempotency-replayed"]).toBe("true");
    const j2 = await r2.json();

    // Core guarantees:
    expect(j2.result).toBe(j1.result);
    expect(j2.idempotencyKey).toBe(idem);
    // Body is usually identical (since you replay cached body)
    expect(j2).toEqual(j1);
  });

  test("409 when same Idempotency-Key used with different body", async ({
    request,
  }) => {
    const idem = key("conflict");
    const rlBucket = bucket("conflict");

    const r1 = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "conf-1",
        "idempotency-key": idem,
        "x-rate-bucket": rlBucket,
      },
      data: { op: "add" as const, a: 2, b: 3 },
    });
    expect(r1.status()).toBe(200);

    const r2 = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "conf-2",
        "idempotency-key": idem,
        "x-rate-bucket": rlBucket,
      },
      data: { op: "add" as const, a: 10, b: 20 },
    });
    expect(r2.status()).toBe(409);
    const j = await r2.json();
    expect(j?.error?.code).toBe("IDEMPOTENCY_KEY_REUSED_DIFFERENT_REQUEST");
  });

  test("no idempotency headers/fields when Idempotency-Key is absent", async ({
    request,
  }) => {
    const rlBucket = bucket("no-key");
    const r = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "no-key-1",
        "x-rate-bucket": rlBucket,
      },
      data: { op: "mul" as const, a: 3, b: 4 },
    });
    expect(r.status()).toBe(200);
    expect(r.headers()["idempotency-replayed"]).toBeUndefined();
    const j = await r.json();
    expect(j.idempotencyKey).toBeUndefined();
    expect(j.replayed).toBeUndefined();
  });

  test("4xx aren't cached; reusing key after 400 processes normally", async ({
    request,
  }) => {
    const idem = key("after-400");
    const rlBucket = bucket("after-400");

    const bad = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "bad-1",
        "idempotency-key": idem,
        "x-rate-bucket": rlBucket,
      },
      data: { op: "add", a: "1" as any, b: 2 }, // Zod 400
    });
    expect(bad.status()).toBe(400);

    const good = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "bad-2",
        "idempotency-key": idem,
        "x-rate-bucket": rlBucket,
      },
      data: { op: "add" as const, a: 1, b: 2 },
    });
    expect(good.status()).toBe(200);
    expect(good.headers()["idempotency-replayed"]).toBe("false");
    const j = await good.json();
    expect(j).toMatchObject({
      result: 3,
      idempotencyKey: idem,
      replayed: false,
    });
  });
});
