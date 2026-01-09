export interface RuntimeEnv {
  appEnv: "local" | "dev" | "prod";
  timezone: string;

  databaseUrl: string;
  redisUrl: string;

  adminApiKey?: string;

  monthlyCredits: number;
  dailyThrottleCredits?: number;
  defaultTier: "low" | "normal" | "high";
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

  return {
    appEnv,
    timezone: env.APP_TIMEZONE ?? "UTC",
    databaseUrl: requireEnv("DATABASE_URL", env.DATABASE_URL),
    redisUrl: requireEnv("REDIS_URL", env.REDIS_URL),
    adminApiKey: env.ADMIN_API_KEY,
    monthlyCredits: parseIntEnv("MONTHLY_CREDITS", env.MONTHLY_CREDITS),
    dailyThrottleCredits,
    defaultTier,
  };
}
