type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  details?: Record<string, unknown>;
}

const MAX_LOGS = 50;
const logs: LogEntry[] = [];

export function addLog(level: LogLevel, message: string, details?: Record<string, unknown>) {
  logs.push({
    timestamp: new Date().toISOString(),
    level,
    message,
    details,
  });
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }

  const prefix = level === "error" ? "[ERROR]" : level === "warn" ? "[WARN]" : "[INFO]";
  console.error(`${prefix} ${message}`, details ? JSON.stringify(details).slice(0, 500) : "");
}

export function getLogs(level?: LogLevel, count = 10): LogEntry[] {
  const filtered = level ? logs.filter((l) => l.level === level) : logs;
  return filtered.slice(-count);
}

export function getLastError(): LogEntry | null {
  const errors = logs.filter((l) => l.level === "error");
  return errors.length > 0 ? errors[errors.length - 1] : null;
}

export function clearLogs() {
  logs.length = 0;
}
