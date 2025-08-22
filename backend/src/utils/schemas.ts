import { z } from "zod";

export const calcInputSchema = z.object({
  op: z.enum(["add", "sub", "mul"]),
  a: z.number(),
  b: z.number(),
});

export const calcOutputSchema = z.object({
  result: z.number(),
  correlationId: z.string().min(1),
  idempotencyKey: z.string().optional(),
  replayed: z.boolean().optional(),
});

export type CalcInput = z.infer<typeof calcInputSchema>;

/* eslint-disable no-unused-vars */
export const operationToImpl: Record<
  CalcInput["op"],
  (a: number, b: number) => number
> = {
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
};
/* eslint-enable no-unused-vars */

export function fingerprint(body: Partial<CalcInput>) {
  return JSON.stringify({ op: body?.op, a: body?.a, b: body?.b });
}
