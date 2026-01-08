import pino from "pino";

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LoggerOptions {
  component: string;
  correlationId?: string;
}

const isDev = process.env.NODE_ENV !== "production";

/**
 * Base logger configuration.
 * - Development: pretty-printed with colors
 * - Production: JSON format for log aggregation
 */
const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with component context.
 */
export function createLogger(options: LoggerOptions): pino.Logger {
  return baseLogger.child({
    component: options.component,
    ...(options.correlationId && { correlationId: options.correlationId }),
  });
}

/**
 * Create a request-scoped logger for API routes.
 * Fastify already provides request.log with request context;
 * use this for cases outside request handlers.
 */
export function createRequestLogger(requestId: string): pino.Logger {
  return createLogger({ component: "api", correlationId: requestId });
}

/**
 * Create a job-scoped logger for worker pipeline jobs.
 */
export function createJobLogger(jobId: string): pino.Logger {
  return createLogger({ component: "pipeline", correlationId: jobId });
}

/**
 * Re-export base logger for simple use cases.
 */
export { baseLogger as logger };

/**
 * Re-export pino types for consumers.
 */
export type { Logger } from "pino";
