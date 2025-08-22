import type { APIRequestContext } from "@playwright/test";

const API_URL = "http://localhost:9999/api/calc";

type Op = "add" | "sub" | "mul";
type CalcBody = { op: Op; a: number; b: number };

export async function postCalc(
  request: APIRequestContext,
  body: CalcBody,
  headers: Record<string, string> = {}
) {
  return request.post(API_URL, {
    headers: { "content-type": "application/json", ...headers },
    data: body,
  });
}
