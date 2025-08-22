export type LogLevel = "info" | "error";

export function logJSON(level: LogLevel, msg: string, extra: Record<string, any> = {}) {
  const line = { ts: new Date().toISOString(), level, msg, ...extra };
  console.log(JSON.stringify(line));
}
