// 结构化日志库
// 分级、JSON 格式、traceId/component/level、Console/Remote 双输出、childLogger 支持

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  component: string;
  traceId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context: LogContext;
  error?: Error;
}

class Logger {
  private minLevel: LogLevel = "info";
  private remoteEndpoint?: string;

  setMinLevel(level: LogLevel) {
    this.minLevel = level;
  }

  setRemoteEndpoint(url: string) {
    this.remoteEndpoint = url;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[this.minLevel];
  }

  private formatEntry(
    level: LogLevel,
    message: string,
    context: LogContext,
    error?: Error,
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: {
        ...context,
        traceId: context.traceId ?? crypto.randomUUID(),
      },
      error: error
        ? { name: error.name, message: error.message, stack: error.stack }
        : undefined,
    };
  }

  private output(entry: LogEntry) {
    const consoleMethod =
      entry.level === "debug"
        ? "debug"
        : entry.level === "info"
          ? "log"
          : entry.level === "warn"
            ? "warn"
            : "error";
    // eslint-disable-next-line no-console -- core logger output
    console[consoleMethod](JSON.stringify(entry));

    if (this.remoteEndpoint && navigator.sendBeacon) {
      navigator.sendBeacon(this.remoteEndpoint, JSON.stringify(entry));
    }
  }

  debug(message: string, context: LogContext) {
    if (this.shouldLog("debug"))
      this.output(this.formatEntry("debug", message, context));
  }

  info(message: string, context: LogContext) {
    if (this.shouldLog("info"))
      this.output(this.formatEntry("info", message, context));
  }

  warn(message: string, context: LogContext, error?: Error) {
    if (this.shouldLog("warn"))
      this.output(this.formatEntry("warn", message, context, error));
  }

  error(message: string, context: LogContext, error?: Error) {
    if (this.shouldLog("error"))
      this.output(this.formatEntry("error", message, context, error));
  }

  child(defaultContext: LogContext): Logger {
    const child = new Logger();
    child.minLevel = this.minLevel;
    child.remoteEndpoint = this.remoteEndpoint;
    const parentOutput = child.output.bind(child);
    child.output = (entry) =>
      parentOutput({
        ...entry,
        context: { ...defaultContext, ...entry.context },
      });
    return child;
  }
}

export const log = new Logger();

// 便捷子 logger
export const logger = {
  popup: () => log.child({ component: "popup" }),
  sidepanel: () => log.child({ component: "sidepanel" }),
  content: () => log.child({ component: "content" }),
  background: () => log.child({ component: "background" }),
  engine: () => log.child({ component: "engine" }),
};
