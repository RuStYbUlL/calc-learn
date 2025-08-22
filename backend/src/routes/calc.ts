import type { IncomingMessage, ServerResponse } from "http";
import { calcInputSchema, calcOutputSchema, operationToImpl, fingerprint } from "../utils/schemas";
import { readJson, json } from "../utils/http";
import { logJSON } from "../utils/log";
import { getIdempotencyKey, tryReplay, saveSuccess, IDEMP_KEY, IDEMP_REPLAYED } from "../utils/idempotency";

export async function handleCalc(req: IncomingMessage, res: ServerResponse, correlationId: string) {
  try {
    const body = await readJson(req);

    // Input validation
    const parsed = calcInputSchema.safeParse(body);
    if (!parsed.success) {
      logJSON("error", "validation_failed", { correlationId, issues: parsed.error.issues });
      return json(res, 400, {
        error: { code: "BAD_INPUT", message: "Validation failed", issues: parsed.error.issues },
        correlationId,
      });
    }

    const { op, a, b } = parsed.data;

    // Idempotency
    const idemKey = getIdempotencyKey(req);
    const fp = fingerprint(parsed.data);
    if (idemKey) {
      if (tryReplay(res, idemKey, fp, correlationId)) return; // responded already
    }

    // Compute
    const compute = operationToImpl[op];
    const result = compute(a, b);
    logJSON("info", "calc_ok", { op, a, b, result, correlationId });

    // Output validation
    const out = { result, correlationId, ...(idemKey ? { idempotencyKey: idemKey, replayed: false } : {}) };
    const outParsed = calcOutputSchema.safeParse(out);
    if (!outParsed.success) {
      logJSON("error", "response_validation_failed", { correlationId });
      return json(res, 500, {
        error: { code: "BAD_OUTPUT", message: "Internal response validation failed" },
        correlationId,
      });
    }

    // Save and set headers for first-time success
    if (idemKey) {
      saveSuccess(idemKey, fp, 200, outParsed.data);
      res.setHeader(IDEMP_KEY, idemKey);
      res.setHeader(IDEMP_REPLAYED, "false");
    }

    return json(res, 200, outParsed.data);
  } catch (err: any) {
    logJSON("error", "unhandled_error", { correlationId, message: String(err?.message ?? err) });
    return json(res, 500, { error: "Server error", correlationId });
  }
}
