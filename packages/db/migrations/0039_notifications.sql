-- Notifications table for in-app alerts
-- Users can be notified about connector errors, parse failures, budget warnings, etc.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,           -- 'x_posts_parse_error', 'budget_warning', etc.
  title TEXT NOT NULL,
  body TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error')),
  data_json JSONB,              -- sourceId, error details, etc.
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fetching unread notifications (most common query)
CREATE INDEX notifications_user_unread_idx ON notifications(user_id, created_at DESC) WHERE is_read = FALSE;

-- Index for fetching all notifications with pagination
CREATE INDEX notifications_user_created_idx ON notifications(user_id, created_at DESC);
