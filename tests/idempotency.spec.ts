import { test, expect } from "@playwright/test";

const URL = "http://localhost:9999/api/calc";

function key(suffix: string) {
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}-${suffix}`;
}

test.describe("Idempotency", () => {
  test("replays the same response for the same Idempotency-Key & same body", async ({
    request,
  }) => {
    const idem = key("same-body");
    const body = { op: "add", a: 1, b: 2 };

    const r1 = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "idem-1",
        "idempotency-key": idem,
      },
      data: body,
    });
    expect(r1.status()).toBe(200);
    const h1 = r1.headers();
    expect(h1["idempotency-replayed"]).toBe("false"); // first time
    const j1 = await r1.json();
    expect(j1).toMatchObject({
      result: 3,
      idempotencyKey: idem,
      replayed: false,
    });

    // Replay
    const r2 = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "idem-2",
        "idempotency-key": idem,
      },
      data: body,
    });
    expect(r2.status()).toBe(200);
    const h2 = r2.headers();
    expect(h2["idempotency-replayed"]).toBe("true"); // <-- assert the header
    const j2 = await r2.json();

    // On replay, many APIs guarantee identical body:
    expect(j2).toEqual(j1); // same JSON as the first response
  });

  test("returns 409 when the same Idempotency-Key is used with a different body", async ({
    request,
  }) => {
    const idem = key("conflict");

    const r1 = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "conf-1",
        "idempotency-key": idem,
      },
      data: { op: "add", a: 2, b: 3 },
    });
    expect(r1.status()).toBe(200);

    const r2 = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "conf-2",
        "idempotency-key": idem,
      },
      data: { op: "add", a: 10, b: 20 }, // different fingerprint
    });
    expect(r2.status()).toBe(409);
    const json = await r2.json();
    expect(json?.error?.code).toBe("IDEMPOTENCY_KEY_REUSED_DIFFERENT_REQUEST");
  });

  test("no idempotency headers or fields when Idempotency-Key is absent", async ({
    request,
  }) => {
    const r = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "no-key-1",
      },
      data: { op: "mul", a: 3, b: 4 },
    });
    expect(r.status()).toBe(200);
    const h = r.headers();
    expect(h["idempotency-replayed"]).toBeUndefined();
    const j = await r.json();
    expect(j.idempotencyKey).toBeUndefined();
    expect(j.replayed).toBeUndefined();
  });

  test("4xx responses are not cached; reusing the key after a 400 should process normally", async ({
    request,
  }) => {
    const idem = key("after-400");

    // First call: invalid (Zod 400)
    const bad = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "bad-1",
        "idempotency-key": idem,
      },
      data: { op: "add", a: "1", b: 2 }, // wrong type for 'a'
    });
    expect(bad.status()).toBe(400);

    // Second call: same key, valid payload — should succeed (not replay, since 400 wasn't stored)
    const good = await request.post(URL, {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": "bad-2",
        "idempotency-key": idem,
      },
      data: { op: "add", a: 1, b: 2 },
    });
    expect(good.status()).toBe(200);
    const h = good.headers();
    expect(h["idempotency-replayed"]).toBe("false");
    const j = await good.json();
    expect(j).toMatchObject({
      result: 3,
      idempotencyKey: idem,
      replayed: false,
    });
  });
});
