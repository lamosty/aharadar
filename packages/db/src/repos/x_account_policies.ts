import type {
  XAccountFeedbackAction,
  XAccountPolicyMode,
  XAccountPolicyRow,
} from "@aharadar/shared";
import {
  applyDecay,
  applyFeedbackDelta,
  getFeedbackDelta,
  normalizeHandle,
} from "@aharadar/shared";

import type { Queryable } from "../db";

/** DB row shape for queries */
interface XAccountPolicyDbRow {
  id: string;
  source_id: string;
  handle: string;
  mode: XAccountPolicyMode;
  pos_score: number;
  neg_score: number;
  last_feedback_at: string | null;
  last_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

function toRow(dbRow: XAccountPolicyDbRow): XAccountPolicyRow {
  return {
    id: dbRow.id,
    source_id: dbRow.source_id,
    handle: dbRow.handle,
    mode: dbRow.mode as XAccountPolicyMode,
    pos_score: dbRow.pos_score,
    neg_score: dbRow.neg_score,
    last_feedback_at: dbRow.last_feedback_at ? new Date(dbRow.last_feedback_at) : null,
    last_updated_at: dbRow.last_updated_at ? new Date(dbRow.last_updated_at) : null,
    created_at: new Date(dbRow.created_at),
    updated_at: new Date(dbRow.updated_at),
  };
}

export function createXAccountPoliciesRepo(db: Queryable) {
  return {
    /**
     * List policy rows for a source and set of handles.
     * Returns existing rows only (does not create missing ones).
     */
    async listBySourceAndHandles(params: {
      sourceId: string;
      handles: string[];
    }): Promise<XAccountPolicyRow[]> {
      if (params.handles.length === 0) {
        return [];
      }

      const normalizedHandles = params.handles.map(normalizeHandle);

      const res = await db.query<XAccountPolicyDbRow>(
        `SELECT
           id::text as id,
           source_id::text as source_id,
           handle,
           mode,
           pos_score,
           neg_score,
           last_feedback_at::text as last_feedback_at,
           last_updated_at::text as last_updated_at,
           created_at::text as created_at,
           updated_at::text as updated_at
         FROM x_account_policies
         WHERE source_id = $1::uuid
           AND handle = ANY($2::text[])
         ORDER BY handle ASC`,
        [params.sourceId, normalizedHandles],
      );

      return res.rows.map(toRow);
    },

    /**
     * Upsert default rows for handles that don't exist.
     * Returns all rows (existing + newly created) for the given handles.
     */
    async upsertDefaults(params: {
      sourceId: string;
      handles: string[];
    }): Promise<XAccountPolicyRow[]> {
      if (params.handles.length === 0) {
        return [];
      }

      const normalizedHandles = params.handles.map(normalizeHandle);

      // Use INSERT ... ON CONFLICT DO NOTHING then SELECT
      await db.query(
        `INSERT INTO x_account_policies (source_id, handle)
         SELECT $1::uuid, unnest($2::text[])
         ON CONFLICT (source_id, handle) DO NOTHING`,
        [params.sourceId, normalizedHandles],
      );

      // Now fetch all rows
      return this.listBySourceAndHandles({
        sourceId: params.sourceId,
        handles: normalizedHandles,
      });
    },

    /**
     * Get a single policy row by source and handle.
     */
    async getBySourceAndHandle(params: {
      sourceId: string;
      handle: string;
    }): Promise<XAccountPolicyRow | null> {
      const normalized = normalizeHandle(params.handle);

      const res = await db.query<XAccountPolicyDbRow>(
        `SELECT
           id::text as id,
           source_id::text as source_id,
           handle,
           mode,
           pos_score,
           neg_score,
           last_feedback_at::text as last_feedback_at,
           last_updated_at::text as last_updated_at,
           created_at::text as created_at,
           updated_at::text as updated_at
         FROM x_account_policies
         WHERE source_id = $1::uuid
           AND handle = $2`,
        [params.sourceId, normalized],
      );

      const row = res.rows[0];
      return row ? toRow(row) : null;
    },

    /**
     * Apply a feedback action to a policy.
     * Loads the row, applies decay to occurredAt, applies the feedback delta,
     * and saves back.
     *
     * Creates the row with defaults if it doesn't exist.
     */
    async applyFeedback(params: {
      sourceId: string;
      handle: string;
      action: XAccountFeedbackAction;
      occurredAt: Date;
    }): Promise<XAccountPolicyRow> {
      const { sourceId, handle, action, occurredAt } = params;
      const normalized = normalizeHandle(handle);

      // Check if action has any effect
      const { posDelta, negDelta } = getFeedbackDelta(action);
      if (posDelta === 0 && negDelta === 0) {
        // Skip has no effect, just ensure row exists
        const rows = await this.upsertDefaults({ sourceId, handles: [normalized] });
        return rows[0]!;
      }

      // Upsert to ensure row exists
      await this.upsertDefaults({ sourceId, handles: [normalized] });

      // Load current row
      const current = await this.getBySourceAndHandle({ sourceId, handle: normalized });
      if (!current) {
        throw new Error(`Failed to load policy row for ${sourceId}/${normalized}`);
      }

      // Apply decay to bring scores to occurredAt
      const decayed = applyDecay(
        current.pos_score,
        current.neg_score,
        current.last_updated_at,
        occurredAt,
      );

      // Apply feedback delta
      const updated = applyFeedbackDelta(decayed.pos, decayed.neg, action);

      // Save back
      const res = await db.query<XAccountPolicyDbRow>(
        `UPDATE x_account_policies
         SET pos_score = $3,
             neg_score = $4,
             last_feedback_at = $5,
             last_updated_at = $5,
             updated_at = now()
         WHERE source_id = $1::uuid AND handle = $2
         RETURNING
           id::text as id,
           source_id::text as source_id,
           handle,
           mode,
           pos_score,
           neg_score,
           last_feedback_at::text as last_feedback_at,
           last_updated_at::text as last_updated_at,
           created_at::text as created_at,
           updated_at::text as updated_at`,
        [sourceId, normalized, updated.pos, updated.neg, occurredAt.toISOString()],
      );

      const row = res.rows[0];
      if (!row) {
        throw new Error(`Failed to update policy row for ${sourceId}/${normalized}`);
      }
      return toRow(row);
    },

    /**
     * Reset policy stats to zero.
     * Does NOT affect mode or delete the row.
     */
    async resetPolicy(params: {
      sourceId: string;
      handle: string;
    }): Promise<XAccountPolicyRow | null> {
      const normalized = normalizeHandle(params.handle);

      const res = await db.query<XAccountPolicyDbRow>(
        `UPDATE x_account_policies
         SET pos_score = 0,
             neg_score = 0,
             last_feedback_at = NULL,
             last_updated_at = now(),
             updated_at = now()
         WHERE source_id = $1::uuid AND handle = $2
         RETURNING
           id::text as id,
           source_id::text as source_id,
           handle,
           mode,
           pos_score,
           neg_score,
           last_feedback_at::text as last_feedback_at,
           last_updated_at::text as last_updated_at,
           created_at::text as created_at,
           updated_at::text as updated_at`,
        [params.sourceId, normalized],
      );

      const row = res.rows[0];
      return row ? toRow(row) : null;
    },

    /**
     * Update the mode for a policy.
     */
    async updateMode(params: {
      sourceId: string;
      handle: string;
      mode: XAccountPolicyMode;
    }): Promise<XAccountPolicyRow | null> {
      const normalized = normalizeHandle(params.handle);

      // Validate mode
      if (!["auto", "always", "mute"].includes(params.mode)) {
        throw new Error(`Invalid mode: ${params.mode}`);
      }

      const res = await db.query<XAccountPolicyDbRow>(
        `UPDATE x_account_policies
         SET mode = $3,
             updated_at = now()
         WHERE source_id = $1::uuid AND handle = $2
         RETURNING
           id::text as id,
           source_id::text as source_id,
           handle,
           mode,
           pos_score,
           neg_score,
           last_feedback_at::text as last_feedback_at,
           last_updated_at::text as last_updated_at,
           created_at::text as created_at,
           updated_at::text as updated_at`,
        [params.sourceId, normalized, params.mode],
      );

      const row = res.rows[0];
      return row ? toRow(row) : null;
    },

    /**
     * Recompute policy scores from feedback history.
     * Useful after deleting feedback events.
     *
     * @param sourceId Source ID
     * @param handle Account handle
     * @param now Current time for decay
     */
    async recomputeFromFeedback(params: {
      sourceId: string;
      handle: string;
      now: Date;
    }): Promise<XAccountPolicyRow | null> {
      const normalized = normalizeHandle(params.handle);
      const authorPattern = `@${normalized}`;

      // Query all feedback events for this author from content items linked to this source
      // Ordered by created_at ASC so we can apply decay sequentially
      const eventsRes = await db.query<{
        action: XAccountFeedbackAction;
        created_at: string;
      }>(
        `SELECT fe.action, fe.created_at::text as created_at
         FROM feedback_events fe
         JOIN content_items ci ON ci.id = fe.content_item_id
         JOIN content_item_sources cis ON cis.content_item_id = ci.id
         WHERE cis.source_id = $1::uuid
           AND lower(ci.author) = lower($2)
         ORDER BY fe.created_at ASC`,
        [params.sourceId, authorPattern],
      );

      // Start fresh
      let pos = 0;
      let neg = 0;
      let lastTime: Date | null = null;

      for (const event of eventsRes.rows) {
        const eventTime = new Date(event.created_at);

        // Apply decay from last event to this event
        if (lastTime) {
          const decayed = applyDecay(pos, neg, lastTime, eventTime);
          pos = decayed.pos;
          neg = decayed.neg;
        }

        // Apply feedback
        const updated = applyFeedbackDelta(pos, neg, event.action);
        pos = updated.pos;
        neg = updated.neg;
        lastTime = eventTime;
      }

      // Apply decay from last event to now
      if (lastTime) {
        const decayed = applyDecay(pos, neg, lastTime, params.now);
        pos = decayed.pos;
        neg = decayed.neg;
      }

      // Update the policy row
      const res = await db.query<XAccountPolicyDbRow>(
        `UPDATE x_account_policies
         SET pos_score = $3,
             neg_score = $4,
             last_updated_at = $5,
             updated_at = now()
         WHERE source_id = $1::uuid AND handle = $2
         RETURNING
           id::text as id,
           source_id::text as source_id,
           handle,
           mode,
           pos_score,
           neg_score,
           last_feedback_at::text as last_feedback_at,
           last_updated_at::text as last_updated_at,
           created_at::text as created_at,
           updated_at::text as updated_at`,
        [params.sourceId, normalized, pos, neg, params.now.toISOString()],
      );

      const row = res.rows[0];
      return row ? toRow(row) : null;
    },
  };
}
