import type { IncomingMessage, ServerResponse } from "http";
import { logJSON } from "./log";

/** Sliding-window rate limit per key. Key is x-rate-bucket (for tests) or remoteAddress. */
const RL_MAX = Number(process.env.RATE_LIMIT_MAX ?? 100);
const RL_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 10_000);

type Bucket = number[];
const buckets = new Map<string, Bucket>();

function keyFor(req: IncomingMessage): string {
  const hdr = req.headers["x-rate-bucket"];
  if (typeof hdr === "string" && hdr.trim()) return hdr.trim();
  return req.socket.remoteAddress || "unknown";
}

export function enforceRateLimit(
  req: IncomingMessage,
  res: ServerResponse,
  correlationId: string
): boolean {
  const key = keyFor(req);
  const now = Date.now();
  const since = now - RL_WINDOW_MS;

  const arr = buckets.get(key) ?? [];
  while (arr.length && arr[0] < since) arr.shift();

  if (arr.length >= RL_MAX) {
    const retryAfterSec = Math.ceil((arr[0] - since) / 1000);
    res.setHeader("retry-after", String(retryAfterSec));
    logJSON("error", "rate_limited", {
      correlationId,
      key,
      retryAfterSec,
      windowMs: RL_WINDOW_MS,
      max: RL_MAX,
    });
    res.writeHead(429, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please retry later.",
        },
        correlationId,
      })
    );
    return true;
  }

  arr.push(now);
  buckets.set(key, arr);
  return false;
}
