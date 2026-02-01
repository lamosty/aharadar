import type { DbContext } from "../db";
import type { NotificationSeverity } from "../repos/notifications";

export interface CreateNotificationHelperParams {
  db: DbContext;
  userId: string;
  type: string;
  title: string;
  body?: string;
  severity?: NotificationSeverity;
  data?: Record<string, unknown>;
}

/**
 * Standalone helper to create a notification from anywhere in the codebase.
 * Fails silently (logs warning) to avoid breaking critical flows like connectors/pipeline.
 */
export async function createNotification(params: CreateNotificationHelperParams): Promise<void> {
  const { db, userId, type, title, body, severity = "info", data } = params;

  try {
    await db.notifications.create({
      userId,
      type,
      title,
      body,
      severity,
      data,
    });
  } catch (err) {
    // Log warning but don't throw - notification creation should never break critical flows
    console.warn("[createNotification] Failed to create notification:", {
      type,
      title,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
