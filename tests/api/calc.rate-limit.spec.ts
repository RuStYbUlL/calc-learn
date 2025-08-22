import { test, expect } from "@playwright/test";

const URL = "http://localhost:8080/api/calc";
function bucket(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test("returns 429 after exceeding edge rate limit for a bucket", async ({
  request,
}) => {
  const rlBucket = bucket("edge");
  const headers = {
    "content-type": "application/json",
    "x-rate-bucket": rlBucket,
  };

  let saw429 = false;
  // Try up to 12 quick requests; default MAX=5 should trip by then
  for (let i = 1; i <= 12; i++) {
    const r = await request.post(URL, {
      headers,
      data: { op: "add", a: 1, b: 1 },
    });
    const s = r.status();
    expect([200, 429]).toContain(s); // sanity
    if (s === 429) {
      const j = await r.json();
      expect(j?.error?.code).toBe("RATE_LIMITED");
      const ra = r.headers()["retry-after"];
      if (ra !== undefined) expect(Number.isFinite(Number(ra))).toBeTruthy();
      saw429 = true;
      break;
    }
  }
  expect(saw429).toBeTruthy();
});
