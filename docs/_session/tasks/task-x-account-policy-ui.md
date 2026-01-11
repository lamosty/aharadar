# Task: feat(web): show X account health + controls

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human (runs commands, merges)

### Goal

Expose X account health (auto throttling state) in the UI, with per‑account mode controls and reset in the X source config, plus a visible “account state” note in the feed’s expanded view.

### Read first (contracts + code)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/spec.md`
- `docs/connectors.md` (x_posts section)
- `docs/pipeline.md`
- `docs/workflows/task-template.md`
- `packages/web/src/components/EditSourceModal/EditSourceModal.tsx`
- `packages/web/src/components/SourceConfigForms/XPostsConfigForm.tsx`
- `packages/web/src/components/Feed/FeedItem.tsx`
- `packages/web/src/components/WhyShown/WhyShown.tsx`
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts`
- `packages/web/src/messages/en.json`
- Backend endpoints added in Task 1 (`admin` and `items` routes)

### Scope (allowed files)

- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/hooks.ts`
- `packages/web/src/components/EditSourceModal/EditSourceModal.tsx`
- `packages/web/src/components/EditSourceModal/EditSourceModal.module.css`
- `packages/web/src/components/WhyShown/WhyShown.tsx`
- `packages/web/src/components/WhyShown/WhyShown.module.css`
- `packages/web/src/components/Feed/FeedItem.tsx`
- `packages/web/src/lib/mock-data.ts` (if needed)
- `packages/web/src/messages/en.json`
- `packages/api/src/routes/items.ts` (if policy info is not already included in Task 1)

If anything else seems required, STOP and ask before changing.

### Decisions (record; if unclear STOP and ask)

Already decided with driver:
- UI must be **very visible and clear**.
- Reset only affects throttling stats (not feedback history).
- Manual Mute is user-only (no auto-mute).
- Place controls inside **X source config**.
- Feed expanded view should show current state + next 👍/👎 effect.
- Mode labels: **Auto / Always fetch / Mute**.

Defaults to implement (tunable later):
- Half-life: **45 days**.
- Exploration floor: **15%**.
- Minimum sample before throttling: **5**.
- Score-to-throttle mapping: smoothstep from 0.35..0.65 → 0.15..1.0.

### Implementation steps (ordered)

1) **API client + hooks**
   - In `packages/web/src/lib/api.ts`, add types for:
     - `XAccountPolicyMode`, `XAccountPolicyState`, `XAccountPolicyView`.
     - `XAccountPoliciesResponse`.
   - Add functions:
     - `getXAccountPolicies(sourceId)` → GET `/admin/sources/:id/x-account-policies`
     - `setXAccountPolicyMode(sourceId, handle, mode)` → PATCH `/admin/sources/:id/x-account-policies/mode`
     - `resetXAccountPolicy(sourceId, handle)` → POST `/admin/sources/:id/x-account-policies/reset`
   - In `packages/web/src/lib/hooks.ts`, add query/mutation hooks for these endpoints.

2) **EditSourceModal: visible X account health section**
   - When `source.type === "x_posts"`, render a new section below the config form:
     - Title: “X Account Health (Auto Throttling)”
     - Short explanation about auto-reduction + exploration floor.
     - For each account (from API response), show:
       - `@handle`
       - Status badge (Normal / Reduced / Muted)
       - Score (0–100) + sample size
       - Mode select: Auto / Always fetch / Mute
       - Reset button
       - “Next 👍 / 👎 effect” text (use `nextLike.throttle` / `nextDislike.throttle`)
   - Ensure loading / empty states are handled (e.g., no accounts configured).
   - Use non-intrusive but visible styling (badges, subtle background, clear text).

3) **Feed expanded view: show policy state**
   - Extend feed item data to include `xAccountPolicy` (from backend items endpoint).
   - In `FeedItem.tsx`, pass `xAccountPolicy` into `WhyShown`.
   - In `WhyShown.tsx`, if `xAccountPolicy` exists, add a small section (near advanced features):
     - “Account health: Reduced (Auto, 15% fetch)”
     - “Next 👍 → 22%” / “Next 👎 → 12%”
   - Keep it short and avoid clutter.

4) **Strings + styling**
   - Add copy in `packages/web/src/messages/en.json` for labels/tooltips.
   - Add CSS for badges + layout in `EditSourceModal.module.css` and `WhyShown.module.css`.

### Acceptance criteria

- [ ] X account health section is visible in X source config, with per-account mode + reset.
- [ ] Feed expanded view shows account state + next feedback effect for x_posts items.
- [ ] No UI changes for non-x_posts sources.
- [ ] All new strings are localized via `en.json`.

### Test plan (copy/paste commands)

```bash
pnpm -r typecheck
```

(If no manual UI run, say “Not run (UI only)”.)

### Commit

- **Message**: `feat(web): show x account health + controls`
- **Files expected**:
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/web/src/components/EditSourceModal/EditSourceModal.tsx`
  - `packages/web/src/components/EditSourceModal/EditSourceModal.module.css`
  - `packages/web/src/components/WhyShown/WhyShown.tsx`
  - `packages/web/src/components/WhyShown/WhyShown.module.css`
  - `packages/web/src/components/Feed/FeedItem.tsx`
  - `packages/web/src/messages/en.json`
  - (optional) `packages/api/src/routes/items.ts`
  - (optional) `packages/web/src/lib/mock-data.ts`

Commit instructions:
- Make exactly **one commit** per task spec.
- If you had to touch files outside **Scope**, stop and ask before committing.

### Final step (required): write task report files (no copy/paste)

After committing, write a short task report to:

- `docs/_session/results/latest.md` (overwrite each task)

Then print only:

```text
WROTE REPORT: docs/_session/results/latest.md
```
