# Task 107 — `fix(web): digest detail WhyShown + triage reason`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Fix Digest Detail (all layouts) so:

- “Why shown” renders correctly (no empty panels)
- triage `aha_score` + `reason` are visible when present
- triage reason is used as the fallback “summary” when deep summaries aren’t available

## Background (what’s broken today)

Digest detail currently passes `item.triageJson?.system_features` into `WhyShown`, but `WhyShown` expects the full triage object (top-level `aha_score`, `reason`, and nested `system_features`). This yields an empty “WHY SHOWN” panel even when triage exists.

Also, digest detail’s “summary” text is currently derived from deep summaries (`summaryJson`), not triage (`triageJson.reason`), so it’s often blank.

See investigation note:

- `docs/learnings/x-posts-digest-broken-2026-01-09.md`

## Read first (required)

- `AGENTS.md`
- `docs/llm.md` (triage schema: `triage_v1`)
- `packages/web/src/components/WhyShown/WhyShown.tsx`
- `packages/web/src/components/DigestDetail/DigestDetailCondensed.tsx`
- `packages/web/src/components/DigestDetail/DigestDetailReader.tsx`
- `packages/web/src/components/DigestDetail/DigestDetailTimeline.tsx`
- `packages/web/src/lib/mock-data.ts` (adapter: `adaptDigestItem`)

## Scope (allowed files)

- `packages/web/src/components/DigestDetail/**`
- `packages/web/src/components/WhyShown/**`
- `packages/web/src/lib/mock-data.ts`
- `packages/web/src/messages/en.json` (only if copy changes require text tweaks)

If anything else seems required, **stop and ask**.

## Implementation steps (ordered)

1. **Fix WhyShown wiring** in all Digest Detail layouts:
   - Pass the full triage object: `features={item.triageJson}` (not `system_features`).
   - Ensure the “unavailable” state triggers when `triageJson` is missing/empty.
2. **Fix “summary” fallback** in digest detail item cards/rows:
   - Prefer deep summary when present (existing behavior).
   - Else show `triageJson.reason` (and optionally `aha_score`) in the “summary” spot.
3. **Fix adapter mapping**:
   - Update `adaptDigestItem()` so `triageSummary` is derived from `triageJson.reason` (not `summaryJson.summary`).
4. **Manual UX smoke**:
   - Verify all 3 layouts show non-empty WhyShown content when triage exists.
   - Verify WhyShown does not render as “empty” when only system features exist.

## Acceptance criteria

- [ ] Digest detail “Why shown” expands and shows meaningful content (Aha score + reason and/or system features).
- [ ] Digest detail never renders an “empty” WhyShown panel.
- [ ] Triage reason is visible on digest detail items when deep summaries are absent.
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build

# Run web locally and open a digest detail page:
pnpm dev:web
```

## Commit

- **Message**: `fix(web): show why-shown + triage reason on digest detail`
- **Files expected**:
  - `packages/web/src/components/DigestDetail/**`
  - `packages/web/src/components/WhyShown/**` (only if required)
  - `packages/web/src/lib/mock-data.ts`

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
