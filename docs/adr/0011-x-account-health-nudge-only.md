# ADR 0011: X account health - nudge-first with opt-in throttling

- **Status**: Accepted (updated 2026-01-13)
- **Date**: 2026-01-13

## Context

We implemented feedback-driven throttling for `x_posts` accounts so repeated dislikes would reduce
fetch probability. In practice, high-volume accounts that occasionally post valuable items can
quickly fall to the exploration floor after a few thumbs-down, which risks missing the good posts.
The desired behavior is **nudge-first** (surface feedback stats) with **opt-in throttling**.

## Decision

- Keep collecting feedback into `x_account_policies` and computing scores/next-effect projections.
- **Default behavior: nudge-only** - account health is informational; no automatic fetch reduction.
- **Opt-in throttling** via per-source config: `accountHealthMode: "throttle"` enables auto-gating.
- UI shows a warning icon next to low-signal X accounts with a CTA to enable throttling.
- XAccountHealth panel shows "Throttling: On/Off" indicator based on source config.

### Config Schema

```typescript
// x_posts source config
interface XPostsConfig {
  accounts: string[];
  // Opt-in throttling (default: "nudge")
  accountHealthMode?: "nudge" | "throttle";
}
```

### UI Flow

1. **Feed**: Low-signal accounts (score < 35%, sample >= 5) show a warning icon next to @handle.
2. **On click**: Popover explains the score and offers "Enable throttling for this source".
3. **Enable throttling**: Updates source config with `accountHealthMode: "throttle"`.
4. **XAccountHealth panel**: Shows throttling status; mode selector only active when throttling enabled.

## Consequences

- By default, no content is skipped due to account health (nudge-only).
- Users can opt-in to throttling on a per-source basis via UI or API.
- Account health remains useful as a transparency/nudge signal.
- Mode values (`auto`/`always`/`mute`) are only applied when throttling is enabled.
