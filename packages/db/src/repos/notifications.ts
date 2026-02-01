import type { Queryable } from "../db";

export type NotificationSeverity = "info" | "warning" | "error";

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  severity: NotificationSeverity;
  data_json: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  body?: string;
  severity?: NotificationSeverity;
  data?: Record<string, unknown>;
}

export interface ListNotificationsParams {
  userId: string;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListRecentNotificationsParams {
  userId: string;
  hoursAgo: number;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
  severities?: NotificationSeverity[];
}

export function createNotificationsRepo(db: Queryable) {
  return {
    /**
     * Create a new notification.
     */
    async create(params: CreateNotificationParams): Promise<NotificationRow> {
      const { userId, type, title, body, severity = "info", data } = params;

      const res = await db.query<NotificationRow>(
        `INSERT INTO notifications (user_id, type, title, body, severity, data_json)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING
           id,
           user_id,
           type,
           title,
           body,
           severity,
           data_json,
           is_read,
           read_at::text as read_at,
           created_at::text as created_at`,
        [userId, type, title, body ?? null, severity, data ? JSON.stringify(data) : null],
      );

      const row = res.rows[0];
      if (!row) throw new Error("Failed to create notification");
      return row;
    },

    /**
     * List notifications for a user with optional filters.
     */
    async listByUser(
      params: ListNotificationsParams,
    ): Promise<{ notifications: NotificationRow[]; total: number }> {
      const { userId, unreadOnly = false, limit = 20, offset = 0 } = params;

      // Get total count
      const countQuery = unreadOnly
        ? `SELECT count(*)::text as count FROM notifications WHERE user_id = $1 AND is_read = FALSE`
        : `SELECT count(*)::text as count FROM notifications WHERE user_id = $1`;

      const countRes = await db.query<{ count: string }>(countQuery, [userId]);
      const total = parseInt(countRes.rows[0]?.count ?? "0", 10);

      // Get notifications
      const listQuery = unreadOnly
        ? `SELECT
             id,
             user_id,
             type,
             title,
             body,
             severity,
             data_json,
             is_read,
             read_at::text as read_at,
             created_at::text as created_at
           FROM notifications
           WHERE user_id = $1 AND is_read = FALSE
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`
        : `SELECT
             id,
             user_id,
             type,
             title,
             body,
             severity,
             data_json,
             is_read,
             read_at::text as read_at,
             created_at::text as created_at
           FROM notifications
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`;

      const res = await db.query<NotificationRow>(listQuery, [
        userId,
        Math.max(1, Math.min(100, limit)),
        Math.max(0, offset),
      ]);

      return { notifications: res.rows, total };
    },

    /**
     * List recent notifications for a user within a time range.
     */
    async listRecentByUser(
      params: ListRecentNotificationsParams,
    ): Promise<{ notifications: NotificationRow[]; total: number }> {
      const { userId, hoursAgo, unreadOnly = false, limit = 50, offset = 0, severities } = params;

      const conditions: string[] = ["user_id = $1", "created_at >= NOW() - $2 * INTERVAL '1 hour'"];
      const values: unknown[] = [userId, hoursAgo];
      let paramIndex = 3;

      if (unreadOnly) {
        conditions.push("is_read = FALSE");
      }

      if (severities && severities.length > 0) {
        conditions.push(`severity = ANY($${paramIndex})`);
        values.push(severities);
        paramIndex++;
      }

      const countRes = await db.query<{ count: string }>(
        `SELECT count(*)::text as count FROM notifications WHERE ${conditions.join(" AND ")}`,
        values,
      );
      const total = parseInt(countRes.rows[0]?.count ?? "0", 10);

      const listValues = [...values, Math.max(1, Math.min(200, limit)), Math.max(0, offset)];

      const res = await db.query<NotificationRow>(
        `SELECT
           id,
           user_id,
           type,
           title,
           body,
           severity,
           data_json,
           is_read,
           read_at::text as read_at,
           created_at::text as created_at
         FROM notifications
         WHERE ${conditions.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        listValues,
      );

      return { notifications: res.rows, total };
    },

    /**
     * Get the count of unread notifications for a user.
     */
    async getUnreadCount(userId: string): Promise<number> {
      const res = await db.query<{ count: string }>(
        `SELECT count(*)::text as count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
        [userId],
      );
      return parseInt(res.rows[0]?.count ?? "0", 10);
    },

    /**
     * Mark a single notification as read.
     */
    async markAsRead(id: string): Promise<NotificationRow | null> {
      const res = await db.query<NotificationRow>(
        `UPDATE notifications
         SET is_read = TRUE, read_at = NOW()
         WHERE id = $1::uuid
         RETURNING
           id,
           user_id,
           type,
           title,
           body,
           severity,
           data_json,
           is_read,
           read_at::text as read_at,
           created_at::text as created_at`,
        [id],
      );
      return res.rows[0] ?? null;
    },

    /**
     * Mark all notifications as read for a user.
     * Returns the count of notifications that were marked as read.
     */
    async markAllAsRead(userId: string): Promise<number> {
      const res = await db.query<{ count: string }>(
        `WITH updated AS (
           UPDATE notifications
           SET is_read = TRUE, read_at = NOW()
           WHERE user_id = $1 AND is_read = FALSE
           RETURNING id
         )
         SELECT count(*)::text as count FROM updated`,
        [userId],
      );
      return parseInt(res.rows[0]?.count ?? "0", 10);
    },

    /**
     * Delete old notifications (for cleanup).
     * Removes notifications older than the specified number of days.
     */
    async deleteOld(userId: string, daysOld: number = 30): Promise<number> {
      const res = await db.query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM notifications
           WHERE user_id = $1 AND created_at < NOW() - make_interval(days => $2)
           RETURNING id
         )
         SELECT count(*)::text as count FROM deleted`,
        [userId, daysOld],
      );
      return parseInt(res.rows[0]?.count ?? "0", 10);
    },
  };
}
