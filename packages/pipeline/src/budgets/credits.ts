import type { Db } from "@aharadar/db";
import { createLogger } from "@aharadar/shared";

const log = createLogger({ component: "budget" });

/**
 * Credits status computed at the start of a pipeline run.
 *
 * - Uses UTC boundaries for MVP (no user timezones yet)
 * - Counts only successful provider calls (status='ok')
 */
export interface CreditsStatus {
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyRemaining: number;
  dailyUsed: number;
  dailyLimit: number | null;
  dailyRemaining: number | null;
  paidCallsAllowed: boolean;
  warningLevel: "none" | "approaching" | "critical";
}

/**
 * Connectors that require paid provider calls.
 * When credits are exhausted, these should be skipped during ingest.
 */
export const PAID_CONNECTOR_TYPES = new Set(["x_posts"]);

/**
 * Compute the current credits status for a user.
 *
 * @param params.windowEnd - Use this as "now" for determining current day/month (deterministic)
 */
export async function computeCreditsStatus(params: {
  db: Db;
  userId: string;
  monthlyCredits: number;
  dailyThrottleCredits?: number;
  windowEnd: string;
}): Promise<CreditsStatus> {
  const windowEndDate = new Date(params.windowEnd);

  // Compute UTC month boundaries
  const monthStart = new Date(
    Date.UTC(windowEndDate.getUTCFullYear(), windowEndDate.getUTCMonth(), 1),
  );
  const monthStartIso = monthStart.toISOString();

  // Compute UTC day boundaries
  const dayStart = new Date(
    Date.UTC(
      windowEndDate.getUTCFullYear(),
      windowEndDate.getUTCMonth(),
      windowEndDate.getUTCDate(),
    ),
  );
  const dayStartIso = dayStart.toISOString();

  // Query monthly used credits
  const monthlyResult = await params.db.query<{ total: string | null }>(
    `select coalesce(sum(cost_estimate_credits), 0)::text as total
     from provider_calls
     where user_id = $1
       and status = 'ok'
       and started_at >= $2::timestamptz`,
    [params.userId, monthStartIso],
  );
  const monthlyRaw = Number.parseFloat(monthlyResult.rows[0]?.total ?? "0") || 0;

  // Query daily used credits
  const dailyResult = await params.db.query<{ total: string | null }>(
    `select coalesce(sum(cost_estimate_credits), 0)::text as total
     from provider_calls
     where user_id = $1
       and status = 'ok'
       and started_at >= $2::timestamptz`,
    [params.userId, dayStartIso],
  );
  const dailyRaw = Number.parseFloat(dailyResult.rows[0]?.total ?? "0") || 0;

  // Query monthly reset offset (sum of all resets within this month)
  const monthlyResetResult = await params.db.query<{ total: string | null }>(
    `select coalesce(sum(credits_at_reset), 0)::text as total
     from budget_resets
     where user_id = $1
       and period = 'monthly'
       and reset_at >= $2::timestamptz`,
    [params.userId, monthStartIso],
  );
  const monthlyOffset = Number.parseFloat(monthlyResetResult.rows[0]?.total ?? "0") || 0;

  // Query daily reset offset (sum of all resets within this day)
  const dailyResetResult = await params.db.query<{ total: string | null }>(
    `select coalesce(sum(credits_at_reset), 0)::text as total
     from budget_resets
     where user_id = $1
       and period = 'daily'
       and reset_at >= $2::timestamptz`,
    [params.userId, dayStartIso],
  );
  const dailyOffset = Number.parseFloat(dailyResetResult.rows[0]?.total ?? "0") || 0;

  // Subtract offsets from raw usage
  const monthlyUsed = Math.max(0, monthlyRaw - monthlyOffset);
  const dailyUsed = Math.max(0, dailyRaw - dailyOffset);

  const monthlyLimit = params.monthlyCredits;
  const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);

  const dailyLimit = params.dailyThrottleCredits ?? null;
  const dailyRemaining = dailyLimit !== null ? Math.max(0, dailyLimit - dailyUsed) : null;

  // Determine if paid calls are allowed
  const monthlyExhausted = monthlyRemaining <= 0;
  const dailyExhausted = dailyLimit !== null && dailyRemaining !== null && dailyRemaining <= 0;
  const paidCallsAllowed = !monthlyExhausted && !dailyExhausted;

  // Compute warning level
  let warningLevel: "none" | "approaching" | "critical" = "none";
  const monthlyUsedPct = monthlyLimit > 0 ? monthlyUsed / monthlyLimit : 0;
  const dailyUsedPct = dailyLimit && dailyLimit > 0 ? dailyUsed / dailyLimit : 0;

  if (monthlyUsedPct >= 0.95 || dailyUsedPct >= 0.95) {
    warningLevel = "critical";
  } else if (monthlyUsedPct >= 0.8 || dailyUsedPct >= 0.8) {
    warningLevel = "approaching";
  }

  return {
    monthlyUsed,
    monthlyLimit,
    monthlyRemaining,
    dailyUsed,
    dailyLimit,
    dailyRemaining,
    paidCallsAllowed,
    warningLevel,
  };
}

/**
 * Print a concise credits warning if appropriate.
 * Returns true if a warning was printed.
 */
export function printCreditsWarning(status: CreditsStatus): boolean {
  if (status.warningLevel === "none") return false;

  const monthlyPct = Math.round((status.monthlyUsed / status.monthlyLimit) * 100);
  const dailyPct =
    status.dailyLimit !== null && status.dailyLimit > 0
      ? Math.round((status.dailyUsed / status.dailyLimit) * 100)
      : null;

  if (status.warningLevel === "critical") {
    if (!status.paidCallsAllowed) {
      log.warn(
        {
          monthlyUsed: status.monthlyUsed,
          monthlyLimit: status.monthlyLimit,
          monthlyPct,
          dailyUsed: status.dailyUsed,
          dailyLimit: status.dailyLimit,
          dailyPct,
        },
        "Credits exhausted; paid calls disabled, falling back to heuristic-only digest",
      );
    } else {
      log.warn(
        {
          monthlyUsed: status.monthlyUsed,
          monthlyLimit: status.monthlyLimit,
          monthlyPct,
          dailyUsed: status.dailyUsed,
          dailyLimit: status.dailyLimit,
          dailyPct,
        },
        "Credits critical (>=95%)",
      );
    }
  } else {
    log.warn(
      {
        monthlyUsed: status.monthlyUsed,
        monthlyLimit: status.monthlyLimit,
        monthlyPct,
        dailyUsed: status.dailyUsed,
        dailyLimit: status.dailyLimit,
        dailyPct,
      },
      "Credits approaching limit (>=80%)",
    );
  }

  return true;
}

export type BudgetPeriod = "daily" | "monthly";

export interface BudgetResetResult {
  period: BudgetPeriod;
  creditsReset: number;
  resetAt: string;
}

/**
 * Reset budget for a given period by recording the current usage as an offset.
 * Future computeCreditsStatus calls will subtract this offset from actual usage.
 */
export async function resetBudget(params: {
  db: Db;
  userId: string;
  period: BudgetPeriod;
  monthlyCredits: number;
  dailyThrottleCredits?: number;
}): Promise<BudgetResetResult> {
  const windowEnd = new Date().toISOString();

  // Get current status to know how many credits to offset
  const status = await computeCreditsStatus({
    db: params.db,
    userId: params.userId,
    monthlyCredits: params.monthlyCredits,
    dailyThrottleCredits: params.dailyThrottleCredits,
    windowEnd,
  });

  // Credits to offset is current used amount for the period
  const creditsToOffset = params.period === "monthly" ? status.monthlyUsed : status.dailyUsed;

  // Insert reset record
  const resetAt = new Date().toISOString();
  await params.db.query(
    `insert into budget_resets (user_id, period, credits_at_reset, reset_at)
     values ($1, $2, $3, $4::timestamptz)`,
    [params.userId, params.period, creditsToOffset, resetAt],
  );

  log.info(
    { userId: params.userId, period: params.period, creditsReset: creditsToOffset },
    "Budget reset recorded",
  );

  return {
    period: params.period,
    creditsReset: creditsToOffset,
    resetAt,
  };
}
