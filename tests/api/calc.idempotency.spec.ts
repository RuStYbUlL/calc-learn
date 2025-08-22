import { test, expect } from "@playwright/test";
import { postCalc } from "../helpers/api";
import { corr, idem } from "../helpers/ids";

test.describe("Idempotency", () => {
  test("replays same response for same Idempotency-Key & same body", async ({
    request,
  }) => {
    const key = idem("same-body");
    const body: Parameters<typeof postCalc>[1] = { op: "add", a: 1, b: 2 };

    const r1 = await postCalc(request, body, {
      "x-correlation-id": corr("idem-1"),
      "idempotency-key": key,
    });
    expect(r1.status()).toBe(200);
    expect(r1.headers()["idempotency-replayed"]).toBe("false");
    const j1 = await r1.json();

    const r2 = await postCalc(request, body, {
      "x-correlation-id": corr("idem-2"),
      "idempotency-key": key,
    });
    expect(r2.status()).toBe(200);
    expect(r2.headers()["idempotency-replayed"]).toBe("true");
    const j2 = await r2.json();

    expect(j2).toEqual(j1); // identical body on replay
  });

  test("409 when same Idempotency-Key used with different body", async ({
    request,
  }) => {
    const key = idem("conflict");

    const r1 = await postCalc(
      request,
      { op: "add", a: 2, b: 3 },
      { "x-correlation-id": corr("conf-1"), "idempotency-key": key }
    );
    expect(r1.status()).toBe(200);

    const r2 = await postCalc(
      request,
      { op: "add", a: 10, b: 20 },
      { "x-correlation-id": corr("conf-2"), "idempotency-key": key }
    );
    expect(r2.status()).toBe(409);
    const j = await r2.json();
    expect(j?.error?.code).toBe("IDEMPOTENCY_KEY_REUSED_DIFFERENT_REQUEST");
  });

  test("no idempotency headers/fields when Idempotency-Key is absent", async ({
    request,
  }) => {
    const r = await postCalc(
      request,
      { op: "mul", a: 3, b: 4 },
      { "x-correlation-id": corr("no-key") }
    );
    expect(r.status()).toBe(200);
    expect(r.headers()["idempotency-replayed"]).toBeUndefined();
    const j = await r.json();
    expect(j.idempotencyKey).toBeUndefined();
    expect(j.replayed).toBeUndefined();
  });

  test("4xx responses aren't cached; reuse key after 400 processes normally", async ({
    request,
  }) => {
    const key = idem("after-400");

    const bad = await request.post("http://localhost:9999/api/calc", {
      headers: {
        "content-type": "application/json",
        "x-correlation-id": corr("bad-1"),
        "idempotency-key": key,
      },
      data: { op: "add", a: "1" as any, b: 2 },
    });
    expect(bad.status()).toBe(400);

    const good = await postCalc(
      request,
      { op: "add", a: 1, b: 2 },
      { "x-correlation-id": corr("bad-2"), "idempotency-key": key }
    );
    expect(good.status()).toBe(200);
    expect(good.headers()["idempotency-replayed"]).toBe("false");
    const j = await good.json();
    expect(j).toMatchObject({
      result: 3,
      idempotencyKey: key,
      replayed: false,
    });
  });
});
