# ✅ DONE

# Task 075: Structured Logging with Pino

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high
- **Driver**: human (runs commands, merges)
- **Status**: Open
- **Priority**: High

## Goal

Replace all `console.log` calls with structured logging using pino. Add correlation IDs for request/job tracing. This is the foundation for production observability.

## Read first (required)

- `CLAUDE.md`
- `docs/architecture.md`
- Code:
  - `packages/api/src/main.ts` (current Fastify logger usage)
  - `packages/worker/src/main.ts` (current console.log usage)
  - `packages/cli/src/main.ts` (current console.log usage)
  - `packages/shared/src/index.ts` (shared utilities)

## Scope (allowed files)

- new: `packages/shared/src/logging.ts`
- `packages/shared/src/index.ts` (re-export logger)
- `packages/shared/package.json` (add pino dependency)
- `packages/api/src/main.ts`
- `packages/api/src/**/*.ts` (replace console.log)
- `packages/worker/src/main.ts`
- `packages/worker/src/**/*.ts` (replace console.log)
- `packages/cli/src/main.ts`
- `packages/cli/src/**/*.ts` (replace console.log)
- `packages/pipeline/src/**/*.ts` (replace console.log)

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

### 1. Create shared logging module

Create `packages/shared/src/logging.ts`:

```typescript
import pino from "pino";

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LoggerOptions {
  component: string;
  correlationId?: string;
}

const isDev = process.env.NODE_ENV !== "production";

// Base logger configuration
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

// Create child logger with component context
export function createLogger(options: LoggerOptions): pino.Logger {
  return baseLogger.child({
    component: options.component,
    ...(options.correlationId && { correlationId: options.correlationId }),
  });
}

// Request-scoped logger for API
export function createRequestLogger(requestId: string): pino.Logger {
  return createLogger({ component: "api", correlationId: requestId });
}

// Job-scoped logger for worker
export function createJobLogger(jobId: string): pino.Logger {
  return createLogger({ component: "worker", correlationId: jobId });
}

export { baseLogger as logger };
```

### 2. Add dependencies

Update `packages/shared/package.json`:
- Add `pino` as dependency
- Add `pino-pretty` as devDependency

### 3. Update API entry point

Update `packages/api/src/main.ts`:
- Import shared logger
- Configure Fastify to use pino with request ID
- Replace all `console.log` with logger calls
- Ensure request ID propagates to route handlers

### 4. Update Worker entry point

Update `packages/worker/src/main.ts`:
- Import shared logger
- Create component logger for scheduler
- Pass job-scoped loggers to pipeline execution
- Replace all `console.log` with logger calls

### 5. Update CLI entry point

Update `packages/cli/src/main.ts`:
- Import shared logger
- Create CLI logger
- Replace `console.log` with logger.info
- Replace `console.error` with logger.error

### 6. Update pipeline stages

Grep for `console.log` in `packages/pipeline/src/`:
- Pass logger through pipeline context
- Replace direct console calls with structured logs
- Include relevant metadata (topicId, sourceId, itemCount, etc.)

### 7. Update remaining packages

Search all packages for remaining `console.log`:
- Replace with appropriate logger calls
- Ensure component name is meaningful

## Log format specification

Production (JSON):
```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.000Z",
  "component": "api",
  "correlationId": "req-abc123",
  "msg": "Request completed",
  "method": "GET",
  "url": "/api/digests",
  "statusCode": 200,
  "durationMs": 45
}
```

Development (pretty):
```
[10:30:00] INFO (api): Request completed
  correlationId: "req-abc123"
  method: "GET"
  url: "/api/digests"
```

## Acceptance criteria

- [ ] All `console.log` replaced with logger calls
- [ ] Correlation IDs present in API request logs
- [ ] Correlation IDs present in worker job logs
- [ ] JSON format in production (NODE_ENV=production)
- [ ] Pretty format in development
- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm -r build` passes

## Test plan (copy/paste)

```bash
# Verify no console.log remains (except in tests)
grep -r "console\.log" packages/*/src --include="*.ts" | grep -v ".test.ts" | grep -v ".spec.ts"

# Build and typecheck
pnpm -r typecheck
pnpm -r build

# Test development output
pnpm dev:api
# Should see pretty logs

# Test production output
NODE_ENV=production pnpm dev:api
# Should see JSON logs
```

## Commit

- **Message**: `feat(shared): add pino structured logging with correlation IDs`
- **Files expected**:
  - `packages/shared/src/logging.ts`
  - `packages/shared/src/index.ts`
  - `packages/shared/package.json`
  - `packages/api/src/main.ts`
  - `packages/worker/src/main.ts`
  - `packages/cli/src/main.ts`
  - Various files in `packages/*/src/` with console.log replaced

## Notes

- Fastify already has built-in pino support; leverage `request.log` for request-scoped logging
- Consider adding `pino-http` for automatic request logging if not already present
- Keep log messages concise; use metadata for details
- Error logs should include stack traces
