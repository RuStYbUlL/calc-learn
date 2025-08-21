import { createServer } from "http";
import { randomUUID } from "crypto";
import { z } from "zod";

const CORS_HEADERS = {
  "access-control-allow-origin": "http://localhost:3000",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type, x-correlation-id",
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
});

// Implementations map (inferred types to keep lint happy and code clear)
const operationToImpl = {
  add: (a: number, b: number) => a + b,
  sub: (a: number, b: number) => a - b,
  mul: (a: number, b: number) => a * b,
};

async function readJson(req: any) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c);
  const txt = Buffer.concat(chunks).toString("utf8");
  return txt ? JSON.parse(txt) : {};
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

      // 2) Compute via DRY operation map
      const compute = operationToImpl[op];
      const result = compute(a, b);

      // Structured success log per calculation
      logJSON("info", "calc_ok", { op, a, b, result, correlationId });

      // 3) Validate output and respond
      const out = { result, correlationId };
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

      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(outParsed.data));
    } catch (err: any) {
      // Structured error log on unhandled exceptions
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
