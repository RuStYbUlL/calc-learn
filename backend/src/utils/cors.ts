import type { IncomingMessage, ServerResponse } from "http";

const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN ?? "http://localhost:3000";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": ALLOW_ORIGIN,
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type, x-correlation-id, idempotency-key",
};

export function applyCORS(_req: IncomingMessage, res: ServerResponse) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

export function isPreflight(req: IncomingMessage) {
  return req.method === "OPTIONS";
}
