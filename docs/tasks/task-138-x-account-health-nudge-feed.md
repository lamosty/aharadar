# Task: feat(web): x account health nudge + opt-in throttling

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high (architect/reviewer)
- **Driver**: human (runs commands, merges)

### Goal

Add a hover nudge for low-signal X accounts in the Feed and provide an explicit opt-in CTA to enable account throttling per source (with confirmation), without changing default behavior.

### Read first (contracts + code)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/connectors.md`
- `docs/pipeline.md`
- `docs/adr/0011-x-account-health-nudge-only.md`
- `packages/web/src/components/Feed/FeedItem.tsx`
- `packages/web/src/components/Feed/FeedItem.module.css`
- `packages/web/src/components/Tooltip/Tooltip.tsx`
- `packages/web/src/components/HelpTooltip/HelpTooltip.tsx`
- `packages/web/src/components/EditSourceModal/XAccountHealth.tsx`
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts`
- `packages/pipeline/src/stages/ingest.ts`
- `packages/shared/src/x_account_policy.ts`

### Scope (allowed files)

- `packages/web/src/components/Feed/FeedItem.tsx`
- `packages/web/src/components/Feed/FeedItem.module.css`
- `packages/web/src/components/Tooltip/Tooltip.tsx` (if needed)
- `packages/web/src/components/HelpTooltip/HelpTooltip.tsx` (if needed)
- `packages/web/src/components/EditSourceModal/XAccountHealth.tsx` (status text only)
- `packages/web/src/components/EditSourceModal/XAccountHealth.module.css`
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts`
- `packages/web/src/messages/en.json`
- `packages/pipeline/src/stages/ingest.ts`
- `docs/connectors.md`
- `docs/adr/0011-x-account-health-nudge-only.md`

If anything else seems required, stop and ask before changing.

### Decisions (already decided)

- **Placement**: show the nudge on Feed item hover, next to the X handle in the source line.
- **Visual**: red warning icon; tooltip/popover explains the signal.
- **CTA**: include a button to enable throttling with a confirmation prompt.
- **Default behavior**: nudge-only; throttling off unless explicitly enabled.

### Implementation steps (ordered)

1. **Config toggle (opt-in)**
   - Add a per-source config flag for `x_posts`, e.g. `accountHealthMode: "nudge" | "throttle"` (default `"nudge"`).
   - Update `docs/connectors.md` and ADR 0011 to document the opt-in field and behavior.

2. **Enable gating when opted-in**
   - In `packages/pipeline/src/stages/ingest.ts`, apply account gating only when `accountHealthMode === "throttle"` for the source.
   - Keep behavior unchanged for sources without opt-in.

3. **Feed hover nudge (X only)**
   - In `FeedItem.tsx`/`SourceSection`, add a warning icon next to the X handle.
   - The icon is only visible on hover and only when the account is low-signal (e.g., `state === "reduced" || "muted"`).

4. **Data fetch for policy on hover**
   - Use `useXAccountPolicies(sourceId)` with `enabled` keyed on hover state so we only fetch when needed.
   - Normalize the item author handle to match policy handles and select the matching policy.

5. **Popover content + CTA**
   - Use `Tooltip` or `HelpTooltip` for the popover.
   - Content should include a short explanation and the computed score/sample (existing policy fields).
   - Add an **Enable throttling** CTA; when clicked, show a confirmation prompt (inline confirm or modal).
   - On confirm, call `useAdminSourcePatch` with `configPatch` to set `accountHealthMode: "throttle"` for that source.
   - Show a toast for success/failure.

6. **Optional status in Edit Source**
   - In `XAccountHealth.tsx`, show a short line indicating whether throttling is enabled for that source.
   - Keep the section informational; do not reintroduce per-account auto controls unless explicitly asked.

### Acceptance criteria

- [ ] For X items with low signal, a red warning icon appears next to the handle on hover.
- [ ] Hovering/clicking shows a tooltip/popover with explanation + score/sample.
- [ ] CTA enables throttling with a confirmation prompt and persists per source.
- [ ] Pipeline only gates X accounts when the source has opted into throttling.
- [ ] Docs updated to reflect opt-in gating (connectors + ADR 0011).

### Test plan (copy/paste commands)

```bash
pnpm -r typecheck
```

(If no manual UI run, say “Not run (UI only)”.)

### Commit

- **Message**: `feat(web): add x account health nudge + opt-in throttling`
- **Files expected**:
  - `packages/web/src/components/Feed/FeedItem.tsx`
  - `packages/web/src/components/Feed/FeedItem.module.css`
  - `packages/web/src/components/Tooltip/Tooltip.tsx` (optional)
  - `packages/web/src/components/HelpTooltip/HelpTooltip.tsx` (optional)
  - `packages/web/src/components/EditSourceModal/XAccountHealth.tsx`
  - `packages/web/src/components/EditSourceModal/XAccountHealth.module.css`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/messages/en.json`
  - `packages/pipeline/src/stages/ingest.ts`
  - `docs/connectors.md`
  - `docs/adr/0011-x-account-health-nudge-only.md`

Commit instructions:

- Make exactly **one commit** per task spec.
- If you had to touch files outside **Scope**, stop and ask before committing.
