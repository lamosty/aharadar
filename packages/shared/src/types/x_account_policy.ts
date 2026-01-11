/**
 * X Account Policy Types
 *
 * Represents per-account throttling state based on user feedback.
 * Used to gradually reduce fetch frequency for accounts with negative feedback.
 */

/** User-controlled mode for an X account */
export type XAccountPolicyMode = "auto" | "always" | "mute";

/** Computed state based on mode and throttle value */
export type XAccountPolicyState = "normal" | "reduced" | "muted";

/** DB row shape for x_account_policies table */
export interface XAccountPolicyRow {
  id: string;
  source_id: string;
  handle: string;
  mode: XAccountPolicyMode;
  pos_score: number;
  neg_score: number;
  last_feedback_at: Date | null;
  last_updated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Derived view of policy with computed fields */
export interface XAccountPolicyView {
  handle: string;
  mode: XAccountPolicyMode;
  /** Smoothed score 0-1 (higher = better) */
  score: number;
  /** Total sample size (pos + neg) */
  sample: number;
  /** Throttle probability 0-1 (0.15 = exploration floor, 1.0 = always fetch) */
  throttle: number;
  /** Computed state based on mode and throttle */
  state: XAccountPolicyState;
  /** Preview of throttle after a like/save */
  nextLike: { score: number; throttle: number };
  /** Preview of throttle after a dislike */
  nextDislike: { score: number; throttle: number };
}

/** Feedback action types that affect policy */
export type XAccountFeedbackAction = "like" | "save" | "dislike" | "skip";
