export type FeedbackAction = "like" | "dislike" | "save" | "skip";

export interface FeedbackEventDraft {
  userId: string;
  digestId?: string | null;
  contentItemId: string;
  action: FeedbackAction;
}

// ============================================================
// Feedback Statistics Types (for dashboard analytics)
// ============================================================

/** Daily breakdown of feedback actions */
export interface FeedbackDailyStats {
  date: string; // ISO date YYYY-MM-DD
  likes: number;
  dislikes: number;
  saves: number;
  skips: number;
}

/** Summary of all feedback with quality metrics */
export interface FeedbackSummary {
  total: number;
  byAction: {
    like: number;
    dislike: number;
    save: number;
    skip: number;
  };
  /** Ratio of positive (like+save) to negative (dislike) feedback. Null if no negative feedback. */
  qualityRatio: number | null;
}

/** Per-topic feedback breakdown */
export interface FeedbackByTopic {
  topicId: string;
  topicName: string;
  likes: number;
  dislikes: number;
  saves: number;
  skips: number;
}

// API Response types
export interface FeedbackDailyStatsResponse {
  ok: true;
  daily: FeedbackDailyStats[];
}

export interface FeedbackSummaryResponse {
  ok: true;
  summary: FeedbackSummary;
}

export interface FeedbackByTopicResponse {
  ok: true;
  topics: FeedbackByTopic[];
}
