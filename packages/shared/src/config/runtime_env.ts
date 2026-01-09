export interface OpsLinks {
  grafana?: string;
  prometheus?: string;
  queue?: string;
  logs?: string;
}

export interface RuntimeEnv {
  appEnv: "local" | "dev" | "prod";
  timezone: string;

  databaseUrl: string;
  redisUrl: string;

  adminApiKey?: string;

  monthlyCredits: number;
  dailyThrottleCredits?: number;
  defaultTier: "low" | "normal" | "high";

  // Worker health probe URL
  workerHealthUrl: string;

  // Ops dashboard links
  opsLinks: OpsLinks;
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseIntEnv(name: string, value: string | undefined): number {
  const raw = requireEnv(name, value);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer env var: ${name}=${raw}`);
  }
  return parsed;
}

export function loadRuntimeEnv(env: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  const appEnvRaw = env.APP_ENV ?? "local";
  const appEnv =
    appEnvRaw === "prod" || appEnvRaw === "dev" || appEnvRaw === "local" ? appEnvRaw : "local";

  const tierRaw = (env.DEFAULT_TIER ?? "normal").toLowerCase();
  const defaultTier =
    tierRaw === "low" || tierRaw === "high" || tierRaw === "normal" ? tierRaw : "normal";

  const dailyThrottleRaw = env.DAILY_THROTTLE_CREDITS;
  const dailyThrottleCredits =
    dailyThrottleRaw && dailyThrottleRaw.length > 0
      ? Number.parseInt(dailyThrottleRaw, 10)
      : undefined;

  // Parse ops links (all optional)
  const opsLinks: OpsLinks = {};
  if (env.OPS_GRAFANA_URL) opsLinks.grafana = env.OPS_GRAFANA_URL;
  if (env.OPS_PROMETHEUS_URL) opsLinks.prometheus = env.OPS_PROMETHEUS_URL;
  if (env.OPS_QUEUE_DASHBOARD_URL) opsLinks.queue = env.OPS_QUEUE_DASHBOARD_URL;
  if (env.OPS_LOGS_URL) opsLinks.logs = env.OPS_LOGS_URL;

  return {
    appEnv,
    timezone: env.APP_TIMEZONE ?? "UTC",
    databaseUrl: requireEnv("DATABASE_URL", env.DATABASE_URL),
    redisUrl: requireEnv("REDIS_URL", env.REDIS_URL),
    adminApiKey: env.ADMIN_API_KEY,
    monthlyCredits: parseIntEnv("MONTHLY_CREDITS", env.MONTHLY_CREDITS),
    dailyThrottleCredits,
    defaultTier,
    workerHealthUrl: env.WORKER_HEALTH_URL ?? "http://localhost:9091/health",
    opsLinks,
  };
}
