type Level = "info" | "warn" | "error";

function log(level: Level, scope: string, message: string, extra?: unknown) {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${scope}: ${message}`;
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (extra === undefined) out(line);
  else out(line, extra);
}

export function logger(scope: string) {
  return {
    info: (msg: string, extra?: unknown) => log("info", scope, msg, extra),
    warn: (msg: string, extra?: unknown) => log("warn", scope, msg, extra),
    error: (msg: string, extra?: unknown) => log("error", scope, msg, extra),
  };
}
