import type { ServerResponse, IncomingMessage } from "http";
import { logJSON } from "./log";

export const IDEMP_KEY = "idempotency-key";
export const IDEMP_REPLAYED = "idempotency-replayed";

const TTL_MS = Number(process.env.IDEMP_TTL_MS ?? 10 * 60 * 1000); // 10 minutes

type Saved = { fingerprint: string; status: number; body: any; expiresAt: number };
const store = new Map<string, Saved>();

function cleanup() {
  const now = Date.now();
  for (const [k, v] of store) if (v.expiresAt < now) store.delete(k);
}
setInterval(cleanup, 60_000).unref();

export function getIdempotencyKey(req: IncomingMessage): string | undefined {
  // Node lowercases headers, but be defensive
  const raw =
    (req.headers[IDEMP_KEY] as string | undefined) ??
    (req.headers["Idempotency-Key" as any] as string | undefined);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return undefined;
}

/** Try to reply from cache. Returns true if a response was sent (replay or conflict). */
export function tryReplay(
  res: ServerResponse,
  key: string,
  fp: string,
  correlationId: string
): boolean {
  const prior = store.get(key);
  if (!prior) return false;

  if (prior.fingerprint !== fp) {
    logJSON("error", "idempotency_conflict", { correlationId, idemKey: key });
    res.writeHead(409, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          code: "IDEMPOTENCY_KEY_REUSED_DIFFERENT_REQUEST",
          message: "This Idempotency-Key was already used for a different request payload.",
        },
        correlationId,
      })
    );
    return true;
  }

  // Same request → replay exact saved body & status; expose via header only
  res.setHeader(IDEMP_KEY, key);
  res.setHeader(IDEMP_REPLAYED, "true");
  logJSON("info", "idempotency_replay", { correlationId, idemKey: key });

  res.writeHead(prior.status, { "content-type": "application/json" });
  res.end(JSON.stringify(prior.body));
  return true;
}

export function saveSuccess(key: string, fp: string, status: number, body: any) {
  store.set(key, { fingerprint: fp, status, body, expiresAt: Date.now() + TTL_MS });
}
