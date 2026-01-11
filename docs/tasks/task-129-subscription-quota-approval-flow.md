# Task 129: Subscription Quota Exceeded Approval Flow

**Status**: TODO
**Priority**: Medium
**Scope**: `packages/api`, `packages/web`, `packages/pipeline`, `packages/llm`

## Problem Statement

When using subscription providers (Claude subscription, Codex subscription) and the hourly quota is exceeded, the system currently throws an error and stops the digest. Users have no way to:
1. See that quota was exceeded
2. Approve fallback to paid API
3. Configure auto-approval behavior

## Current Behavior (After Recent Fix)

```
User selects "claude-subscription" provider
  → Digest runs
  → 100 calls made (quota)
  → 101st call throws: "Claude subscription quota exceeded"
  → Digest fails/stops
```

## Desired Behavior

```
User selects "claude-subscription" provider
  → Digest runs
  → 100 calls made (quota)
  → 101st call triggers approval flow:
      Option A (Pause): Job pauses, notification sent, await user decision
      Option B (Auto-approve): Falls back to API, continues (if configured)
      Option C (Stop): Fails gracefully with clear message
```

## User Stories

1. **As a user**, when my subscription quota is exceeded mid-digest, I want to be notified and given a choice whether to continue with paid API or stop.

2. **As a user**, I want to configure my preference for quota handling:
   - Always pause and ask (safest)
   - Auto-approve fallback (convenient)
   - Always stop (strict budget)

3. **As a user**, I want to see warnings in the UI when I'm approaching quota limits before starting a digest.

## Implementation Plan

### Phase 1: Quota Status & Warnings

1. **API endpoint for quota status**
   ```typescript
   GET /api/llm/quota
   Response: {
     claude: { used: 85, limit: 100, resetAt: "2026-01-11T22:00:00Z" },
     codex: { used: 20, limit: 50, resetAt: "2026-01-11T22:00:00Z" }
   }
   ```

2. **Pre-digest warning in UI**
   - Show quota status before running digest
   - Warning if estimated calls > remaining quota
   - "This digest may exceed your subscription quota (85/100 used)"

### Phase 2: Quota Exceeded Handling

1. **New LLM settings field**
   ```typescript
   interface LlmSettings {
     // ... existing fields
     quotaExceededBehavior: "pause" | "fallback" | "stop";
     fallbackProvider: "openai" | "anthropic" | null;
   }
   ```

2. **Router quota handling modes**
   ```typescript
   // In router.ts
   if (!canUseClaudeSubscription(limits)) {
     const behavior = env.QUOTA_EXCEEDED_BEHAVIOR ?? "stop";

     if (behavior === "stop") {
       throw new QuotaExceededError("Claude subscription quota exceeded");
     }

     if (behavior === "fallback") {
       console.warn("[llm] Quota exceeded, falling back to API");
       return resolveFallbackProvider(env);
     }

     if (behavior === "pause") {
       throw new QuotaPauseError("Claude subscription quota exceeded - awaiting approval");
     }
   }
   ```

### Phase 3: Pause & Approval Flow

1. **Job pause mechanism**
   - Digest job catches `QuotaPauseError`
   - Saves current state to DB (items processed, items remaining)
   - Sets digest status to `paused_quota_exceeded`

2. **Notification system**
   - Create notification record in DB
   - Show in UI: "Digest paused - subscription quota exceeded"
   - Options: "Continue with paid API" / "Stop digest" / "Wait for quota reset"

3. **Resume mechanism**
   - User clicks "Continue with paid API"
   - API updates digest settings for this run
   - Worker resumes digest from saved state

### Phase 4: UI Implementation

1. **LLM Settings page additions**
   ```
   Quota Exceeded Behavior:
   ○ Pause and ask me (recommended)
   ○ Automatically use fallback API
     ⚠️ Warning: May incur API costs
   ○ Stop the digest

   Fallback Provider: [OpenAI ▼]
   ```

2. **Digest status display**
   - New status badge: "Paused - Quota Exceeded"
   - Action buttons: Resume / Stop / Wait

3. **Quota dashboard widget**
   - Show current usage for all subscription providers
   - Time until reset
   - Historical usage chart (optional)

## Database Changes

```sql
-- Add to llm_settings table
ALTER TABLE llm_settings ADD COLUMN quota_exceeded_behavior TEXT DEFAULT 'stop';
ALTER TABLE llm_settings ADD COLUMN fallback_provider TEXT;

-- New notifications table (if not exists)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add digest pause state
ALTER TABLE digests ADD COLUMN paused_at TIMESTAMPTZ;
ALTER TABLE digests ADD COLUMN pause_reason TEXT;
ALTER TABLE digests ADD COLUMN resume_config JSONB;
```

## Error Types

```typescript
// packages/llm/src/errors.ts
export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public provider: string,
    public quotaUsed: number,
    public quotaLimit: number,
    public resetAt: Date
  ) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export class QuotaPauseError extends Error {
  constructor(
    message: string,
    public provider: string,
    public fallbackOptions: string[]
  ) {
    super(message);
    this.name = "QuotaPauseError";
  }
}
```

## Open Questions

1. **Redis for quota tracking?** Current in-memory tracking resets on restart. Need persistent tracking for accurate quotas across restarts.

2. **Multi-process quota sharing?** If running multiple workers, need shared quota state (Redis).

3. **Notification delivery?** Email? In-app only? Push notifications?

4. **Partial digest results?** When paused, show partial results or hide until complete?

## Success Criteria

- [ ] Users see quota status before starting digest
- [ ] Quota exceeded triggers configurable behavior (pause/fallback/stop)
- [ ] Pause flow works with resume capability
- [ ] Clear UI for managing quota preferences
- [ ] No unexpected API costs from silent fallback

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Quota Status | Small |
| Phase 2: Handling Modes | Medium |
| Phase 3: Pause/Resume | Large |
| Phase 4: UI | Medium |

**Total**: 2-3 sessions

## References

- Current quota tracking: `packages/llm/src/usage_tracker.ts`
- Router provider selection: `packages/llm/src/router.ts`
- Digest orchestration: `packages/pipeline/src/stages/digest.ts`
