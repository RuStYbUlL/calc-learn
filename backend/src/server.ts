import { createServer } from "http";

const CORS_HEADERS = {
  "access-control-allow-origin": "http://localhost:3000",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

async function readJson(req: any) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c);
  const txt = Buffer.concat(chunks).toString("utf8");
  return txt ? JSON.parse(txt) : {};
}

const server = createServer(async (req, res) => {
  // CORS
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // Minimal calculator: add/sub only
  if (req.method === "POST" && req.url === "/api/calc") {
    try {
      const body = await readJson(req);
      const op = String(body?.op ?? "");
      const aNum = Number(body?.a);
      const bNum = Number(body?.b);

      // 1) Validate numbers
      if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "a and b must be numbers" }));
      }

      // 2) Explicitly allow only add/sub (future: add 'mul' | 'div' here)
      switch (op) {
        case "add": {
          const result = aNum + bNum;
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(JSON.stringify({ result }));
        }
        case "sub": {
          const result = aNum - bNum;
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(JSON.stringify({ result }));
        }
        case "mul": {
          const result = aNum * bNum;
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(JSON.stringify({ result }));
        }
        default: {
          // Clear error message makes the rule obvious
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(
            JSON.stringify({
              error: "Unsupported op. Allowed: 'add', 'sub', 'mul'.",
            })
          );
        }
      }
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "Server error" }));
    }
  }

  // Fallback
  res.writeHead(404);
  res.end();
});

server.listen(9999, () => {
  console.log("Server running on http://localhost:9999");
});
