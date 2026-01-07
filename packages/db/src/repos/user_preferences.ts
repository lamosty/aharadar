import type { Queryable } from "../db";

export type ViewingProfile = "power" | "daily" | "weekly" | "research" | "custom";

/**
 * Default decay hours for each viewing profile.
 */
export const PROFILE_DECAY_HOURS: Record<ViewingProfile, number> = {
  power: 4, // Fast decay for power users
  daily: 24, // 24 hours
  weekly: 168, // 7 days
  research: 720, // 30 days
  custom: 24, // Default for custom, user sets their own
};

export interface UserPreferencesRow {
  user_id: string;
  viewing_profile: ViewingProfile;
  decay_hours: number;
  last_checked_at: string | null;
  custom_settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UserViewingPreferences {
  userId: string;
  viewingProfile: ViewingProfile;
  decayHours: number;
  lastCheckedAt: Date | null;
  customSettings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

function rowToPreferences(row: UserPreferencesRow): UserViewingPreferences {
  return {
    userId: row.user_id,
    viewingProfile: row.viewing_profile,
    decayHours: row.decay_hours,
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at) : null,
    customSettings: row.custom_settings,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function createUserPreferencesRepo(db: Queryable) {
  return {
    /**
     * Get user preferences, creating default if not exists.
     */
    async getOrCreate(userId: string): Promise<UserViewingPreferences> {
      // Try to get existing
      const existing = await db.query<UserPreferencesRow>(
        `SELECT
           user_id,
           viewing_profile,
           decay_hours,
           last_checked_at::text,
           custom_settings,
           created_at::text,
           updated_at::text
         FROM user_preferences
         WHERE user_id = $1`,
        [userId]
      );

      if (existing.rows[0]) {
        return rowToPreferences(existing.rows[0]);
      }

      // Create default preferences
      const result = await db.query<UserPreferencesRow>(
        `INSERT INTO user_preferences (user_id, viewing_profile, decay_hours)
         VALUES ($1, 'daily', 24)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING
           user_id,
           viewing_profile,
           decay_hours,
           last_checked_at::text,
           custom_settings,
           created_at::text,
           updated_at::text`,
        [userId]
      );

      if (result.rows[0]) {
        return rowToPreferences(result.rows[0]);
      }

      // Race condition: another process created it, fetch again
      const refetch = await db.query<UserPreferencesRow>(
        `SELECT
           user_id,
           viewing_profile,
           decay_hours,
           last_checked_at::text,
           custom_settings,
           created_at::text,
           updated_at::text
         FROM user_preferences
         WHERE user_id = $1`,
        [userId]
      );

      if (!refetch.rows[0]) {
        throw new Error("Failed to create or fetch user preferences");
      }

      return rowToPreferences(refetch.rows[0]);
    },

    /**
     * Update user preferences.
     */
    async update(params: {
      userId: string;
      viewingProfile?: ViewingProfile;
      decayHours?: number;
      customSettings?: Record<string, unknown>;
    }): Promise<UserViewingPreferences> {
      const { userId, viewingProfile, decayHours, customSettings } = params;

      // Build dynamic update
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (viewingProfile !== undefined) {
        updates.push(`viewing_profile = $${paramIdx}`);
        values.push(viewingProfile);
        paramIdx++;

        // Auto-set decay_hours based on profile (unless custom)
        if (viewingProfile !== "custom" && decayHours === undefined) {
          updates.push(`decay_hours = $${paramIdx}`);
          values.push(PROFILE_DECAY_HOURS[viewingProfile]);
          paramIdx++;
        }
      }

      if (decayHours !== undefined) {
        updates.push(`decay_hours = $${paramIdx}`);
        values.push(Math.max(1, Math.min(720, decayHours)));
        paramIdx++;
      }

      if (customSettings !== undefined) {
        updates.push(`custom_settings = $${paramIdx}`);
        values.push(JSON.stringify(customSettings));
        paramIdx++;
      }

      if (updates.length === 0) {
        // No updates, just return current
        return this.getOrCreate(userId);
      }

      values.push(userId);

      const result = await db.query<UserPreferencesRow>(
        `UPDATE user_preferences
         SET ${updates.join(", ")}
         WHERE user_id = $${paramIdx}
         RETURNING
           user_id,
           viewing_profile,
           decay_hours,
           last_checked_at::text,
           custom_settings,
           created_at::text,
           updated_at::text`,
        values
      );

      if (!result.rows[0]) {
        // Doesn't exist, create with defaults then update
        await this.getOrCreate(userId);
        return this.update(params);
      }

      return rowToPreferences(result.rows[0]);
    },

    /**
     * Mark the feed as "caught up" - updates last_checked_at to now.
     */
    async markChecked(userId: string): Promise<UserViewingPreferences> {
      // Ensure preferences exist
      await this.getOrCreate(userId);

      const result = await db.query<UserPreferencesRow>(
        `UPDATE user_preferences
         SET last_checked_at = now()
         WHERE user_id = $1
         RETURNING
           user_id,
           viewing_profile,
           decay_hours,
           last_checked_at::text,
           custom_settings,
           created_at::text,
           updated_at::text`,
        [userId]
      );

      if (!result.rows[0]) {
        throw new Error("Failed to update last_checked_at");
      }

      return rowToPreferences(result.rows[0]);
    },
  };
}
