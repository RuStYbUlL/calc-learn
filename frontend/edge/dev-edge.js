const http = require("http");
const { request: httpRequest } = require("http");
const { randomUUID } = require("crypto");

// coarse rate limit per remoteAddress
const MAX = Number(process.env.EDGE_RL_MAX ?? 5);
const WINDOW_MS = Number(process.env.EDGE_RL_WINDOW_MS ?? 10_000);
const buckets = new Map();

// Add bucket key by header to isolate tests
function bucketKey(req) {
  const hdr = req.headers["x-rate-bucket"];
  if (typeof hdr === "string" && hdr.trim()) return hdr.trim();
  return req.socket.remoteAddress || "unknown";
}

function rateLimited(req) {
  const key = bucketKey(req);
  const now = Date.now();
  const since = now - WINDOW_MS;
  const arr = buckets.get(key) ?? [];
  while (arr.length && arr[0] < since) arr.shift();
  if (arr.length >= MAX) return true;
  arr.push(now);
  buckets.set(key, arr);
  return false;
}
// -------------------------------------------------

const EDGE_PORT = 8080;
const FRONTEND = { host: "localhost", port: 3000 };
const BACKEND = { host: "localhost", port: 9999 };

const server = http.createServer((req, res) => {
  // correlation id pass-through (let backend generate if absent)
  const corr = req.headers["x-correlation-id"] || randomUUID();

  // Edge 429 (only for /api/*)
  if (req.url.startsWith("/api/") && rateLimited(req)) {
    res.statusCode = 429;
    res.setHeader("content-type", "application/json");
    res.setHeader("retry-after", "1");
    res.setHeader("x-correlation-id", corr);
    res.end(
      JSON.stringify({
        error: { code: "RATE_LIMITED", message: "Too many requests." },
        correlationId: corr,
      })
    );
    return;
  }

  // Decide target
  const target = req.url.startsWith("/api/") ? BACKEND : FRONTEND;

  // Proxy the request
  const opts = {
    hostname: target.host,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, "x-correlation-id": corr },
  };

  const proxyReq = httpRequest(opts, (proxyRes) => {
    // Relay status/headers/body
    res.writeHead(proxyRes.statusCode || 502, {
      ...proxyRes.headers,
      "x-correlation-id": corr, // make sure client sees it
    });
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (e) => {
    res.writeHead(502, {
      "content-type": "application/json",
      "x-correlation-id": corr,
    });
    res.end(
      JSON.stringify({
        error: { code: "BAD_GATEWAY", message: String(e.message) },
        correlationId: corr,
      })
    );
  });

  req.pipe(proxyReq);
});

server.listen(EDGE_PORT, () => {
  console.log(`Edge running on http://localhost:${EDGE_PORT}`);
});
