import { createServer } from "http";
import { randomUUID } from "crypto";
import { z } from "zod";

const CORS_HEADERS = {
  "access-control-allow-origin": "http://localhost:3000",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers":
    "content-type, x-correlation-id, idempotency-key",
};

function getCorrelationId(req: any): string {
  const incoming = req.headers["x-correlation-id"];
  if (typeof incoming === "string" && incoming.length > 0) return incoming;
  return randomUUID();
}

function logJSON(
  level: "info" | "error",
  msg: string,
  extra: Record<string, any> = {}
) {
  const line = { ts: new Date().toISOString(), level, msg, ...extra };
  console.log(JSON.stringify(line));
}

async function readJson(req: any) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c);
  const txt = Buffer.concat(chunks).toString("utf8");
  return txt ? JSON.parse(txt) : {};
}

// Zod schemas for calculator API (add, sub, mul)
// Keep validation centralized and consistent for all operations
const calcInputSchema = z.object({
  op: z.enum(["add", "sub", "mul"]),
  a: z.number(),
  b: z.number(),
});

const calcOutputSchema = z.object({
  result: z.number(),
  correlationId: z.string().min(1),
  idempotencyKey: z.string().optional(),
  replayed: z.boolean().optional(),
});

// Implementations map
const operationToImpl = {
  add: (a: number, b: number) => a + b,
  sub: (a: number, b: number) => a - b,
  mul: (a: number, b: number) => a * b,
};

// --- Idempotency for all ops (in-memory) ---
const IDEMP_KEY = "idempotency-key";
const IDEMP_REPLAYED = "idempotency-replayed";
const IDEMP_TTL_MS = 10 * 60 * 1000; // 10 minutes

type Saved = {
  fingerprint: string;
  status: number;
  body: any;
  expiresAt: number;
};
const idemStore = new Map<string, Saved>();

function cleanupIdemStore() {
  const now = Date.now();
  for (const [k, v] of idemStore) if (v.expiresAt < now) idemStore.delete(k);
}

// Periodic GC
setInterval(cleanupIdemStore, 60_000).unref();

// fingerprint across all ops for /api/calc
function fp(body: any) {
  return JSON.stringify({ op: body?.op, a: body?.a, b: body?.b });
}

const server = createServer(async (req, res) => {
  // Correlation ID + access log setup per request
  const correlationId = getCorrelationId(req);
  res.setHeader("x-correlation-id", correlationId);
  const requestStartedAt = Date.now();

  res.on("finish", () => {
    logJSON("info", "http_access", {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      durationMs: Date.now() - requestStartedAt,
      correlationId,
    });
  });

  // CORS
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // Minimal calculator: add/sub/mul
  if (req.method === "POST" && req.url === "/api/calc") {
    try {
      const body = await readJson(req);

      // 1) Validate input for all operations with Zod
      const parsed = calcInputSchema.safeParse(body);
      if (!parsed.success) {
        logJSON("error", "validation_failed", {
          correlationId,
          issues: parsed.error.issues,
        });
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({
            error: {
              code: "BAD_INPUT",
              message: "Validation failed",
              issues: parsed.error.issues,
            },
            correlationId,
          })
        );
      }

      const { op, a, b } = parsed.data;

      // --- 2) Idempotency handling ---
      // Accept either lowercase or canonical header
      const incomingKeyRaw =
        (req.headers[IDEMP_KEY] as string | undefined) ??
        (req.headers["Idempotency-Key" as any] as string | undefined);

      const idemKey =
        typeof incomingKeyRaw === "string" && incomingKeyRaw.trim().length > 0
          ? incomingKeyRaw.trim()
          : undefined;

      const fingerprint = fp(parsed.data);

      if (idemKey) {
        const prior = idemStore.get(idemKey);
        if (prior) {
          // Same request? replay it
          if (prior.fingerprint === fingerprint) {
            res.setHeader(IDEMP_KEY, idemKey);
            res.setHeader(IDEMP_REPLAYED, "true");
            logJSON("info", "idempotency_replay", { correlationId, idemKey });

            res.writeHead(prior.status, { "content-type": "application/json" });
            return res.end(JSON.stringify(prior.body));
          }
          // Different request with same key => conflict
          logJSON("error", "idempotency_conflict", {
            correlationId,
            idemKey,
          });
          res.writeHead(409, { "content-type": "application/json" });
          return res.end(
            JSON.stringify({
              error: {
                code: "IDEMPOTENCY_KEY_REUSED_DIFFERENT_REQUEST",
                message:
                  "This Idempotency-Key was already used for a different request payload.",
              },
              correlationId,
            })
          );
        }
      }

      // 3) Compute via DRY operation map
      const compute = operationToImpl[op];
      const result = compute(a, b);

      logJSON("info", "calc_ok", { op, a, b, result, correlationId });

      // 4) Validate output and respond
      const out = {
        result,
        correlationId,
        ...(idemKey ? { idempotencyKey: idemKey, replayed: false } : {}),
      };
      const outParsed = calcOutputSchema.safeParse(out);
      if (!outParsed.success) {
        logJSON("error", "response_validation_failed", { correlationId });
        res.writeHead(500, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({
            error: {
              code: "BAD_OUTPUT",
              message: "Internal response validation failed",
            },
            correlationId,
          })
        );
      }

      // Save successful response for future replays if we have a key
      if (idemKey) {
        idemStore.set(idemKey, {
          fingerprint,
          status: 200,
          body: outParsed.data,
          expiresAt: Date.now() + IDEMP_TTL_MS,
        });
        res.setHeader(IDEMP_KEY, idemKey);
        res.setHeader(IDEMP_REPLAYED, "false");
      }

      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(outParsed.data));
    } catch (err: any) {
      logJSON("error", "unhandled_error", {
        correlationId,
        message: String(err?.message ?? err),
      });
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "Server error", correlationId }));
    }
  }

  // Fallback
  res.writeHead(404);
  res.end();
});

server.listen(9999, () => {
  console.log("Server running on http://localhost:9999");
});
