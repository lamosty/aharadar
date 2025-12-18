export type BudgetTier = "low" | "normal" | "high";

export interface CreditsBudget {
  /** Primary cap. */
  monthlyCredits: number;
  /** Optional throttle to avoid burning the whole month in one day. */
  dailyThrottleCredits?: number;
}

export interface CreditsExhaustionPolicy {
  onLowCredits: "warn";
  onExhaustedCredits: "fallback_low" | "stop";
  warningThresholds: {
    monthlyUsedPct: number[];
    dailyThrottleUsedPct: number[];
  };
}
