import { createServer } from "http";
import { randomUUID } from "crypto";
import { applyCORS, isPreflight } from "../utils/cors";
import { logJSON } from "../utils/log";
import { notFound } from "../utils/http";
import { handleCalc } from "../routes/calc";
import { enforceRateLimit } from "../utils/rateLimit";

function getCorrelationId(req: any): string {
  const incoming = req.headers["x-correlation-id"];
  if (typeof incoming === "string" && incoming.length > 0) return incoming;
  return randomUUID();
}

const server = createServer(async (req, res) => {
  const correlationId = getCorrelationId(req);
  res.setHeader("x-correlation-id", correlationId);

  const startedAt = Date.now();
  res.on("finish", () => {
    logJSON("info", "http_access", {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      correlationId,
    });
  });

  applyCORS(req, res);
  if (isPreflight(req)) {
    res.writeHead(204);
    return res.end();
  }

  if (req.url?.startsWith("/api/")) {
    if (enforceRateLimit(req, res, correlationId)) return; // <-- early 429
  }

  if (req.method === "POST" && req.url === "/api/calc") {
    return handleCalc(req, res, correlationId);
  }

  return notFound(res);
});

server.listen(9999, () => {
  console.log("Server running on http://localhost:9999");
});
