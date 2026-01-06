export type FeedbackAction = "like" | "dislike" | "save" | "skip";

export interface FeedbackEventDraft {
  userId: string;
  digestId?: string | null;
  contentItemId: string;
  action: FeedbackAction;
}
