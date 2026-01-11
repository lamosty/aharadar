# Task 137 — `feat(deep-dive): manual paste summary + promote/drop`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human (runs commands, merges)

## Goal

Add a second‑stage “Deep Dive” flow where users paste full content for a liked item, generate an AI summary, and then **Promote** or **Drop** it. Raw pasted content is never stored; summaries are stored only when promoted.

This task also **removes Save entirely across the app** (web + API + CLI + shared types + docs).

## Read first (required)

- `AGENTS.md`
- `docs/spec.md`
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/llm.md`
- `docs/budgets.md`
- `docs/web.md`
- Code:
  - `packages/api/src/routes/items.ts`
  - `packages/api/src/routes/feedback.ts`
  - `packages/api/src/routes/ask.ts` (budget gating pattern)
  - `packages/web/src/app/app/feed/page.tsx`
  - `packages/web/src/components/FeedbackButtons/FeedbackButtons.tsx`
  - `packages/web/src/components/AppShell/nav-model.ts`
  - `packages/web/src/lib/api.ts`
  - `packages/web/src/lib/hooks.ts`
  - `packages/cli/src/commands/review.ts`
  - `packages/cli/src/ui/keymap.ts`
  - `packages/llm/src/deep_summary.ts`
  - `packages/pipeline/src/stages/llm_enrich.ts`

## Scope (allowed files)

- `packages/db/migrations/*`
- `packages/db/src/repos/*`
- `packages/api/src/routes/*`
- `packages/llm/src/*`
- `packages/web/src/app/app/*`
- `packages/web/src/components/*`
- `packages/web/src/lib/*`
- `packages/web/src/messages/en.json`
- `packages/cli/src/*`
- `packages/shared/src/types/*`
- `docs/spec.md`
- `docs/data-model.md`
- `docs/llm.md`
- `docs/web.md`
- `docs/cli.md`

If anything else seems required, stop and ask before changing.

## Decisions (locked)

- **Feedback actions everywhere**: **like / dislike / skip only**. Remove Save from web, API, CLI, shared types, and docs. Convert any existing `save` feedback rows to `like` via migration.
- **Deep Dive source**: items with latest feedback action = **like** only.
- **Page name**: use **“Deep Dive”** in nav and URLs (rename later if desired).
- **Storage**: never store raw pasted text; store summary JSON **only when promoted**.
- **Budgeting**: use `computeCreditsStatus` gating (same pattern as `ask.ts`). No special allowance for subscription providers yet.
- **Paste cap**: enforce **max 60,000 chars** (≈ 10+ A4 pages). UI should show a live counter + error state if exceeded.

> If any of these are unclear, stop and ask before implementing.

## Implementation steps (ordered)

1. **DB schema**
   - Add a new table (name suggestion: `content_item_deep_reviews`) to store deep‑review decisions:
     - `user_id`, `content_item_id` (unique per user+item)
     - `status`: `promoted | dropped`
     - `summary_json` (nullable; **only for promoted**)
     - `created_at`, `updated_at`
   - Add indexes: `(user_id, status)` and unique `(user_id, content_item_id)`.
   - Add a migration to **convert existing `feedback_events.action = 'save'` to `'like'`**.
   - Update `docs/data-model.md` with the new table contract.

2. **LLM task**
   - Add a **manual summary** helper that reuses the deep‑summary model selection, but uses a dedicated prompt:
     - New prompt id: `manual_summary_v1` (schema stays `deep_summary_v1`).
     - The prompt must explicitly note: if the input contains comments/discussion, surface the most insightful comments.
     - Include candidate title/source/author/url from the DB and the pasted body text in the user prompt.
   - Log `provider_calls` with purpose `manual_summary`.
   - Update `docs/llm.md` to include the manual summary task (purpose + prompt notes).

3. **API routes**
   - Add new routes under `/api`:
     - `POST /deep-dive/preview`
       - Body: `{ contentItemId, rawText }`
       - Validate UUID; validate length (≤ 60k); fetch item for title/source/author/url; run manual summary; return summary JSON + usage metadata.
       - Use `computeCreditsStatus` gating like `ask.ts` (402 if exhausted).
     - `POST /deep-dive/decision`
       - Body: `{ contentItemId, action: "promote" | "drop", summaryJson? }`
       - Upsert decision; store summary only on promote.
     - `GET /deep-dive/queue`
       - Return items with latest feedback action = `like` AND **no deep‑review decision**.
     - `GET /deep-dive/promoted`
       - Return items with deep‑review `status = promoted` + summary JSON.
   - Return item metadata needed for UI: title, url, author, publishedAt, sourceType, topic, triageJson.

4. **Remove Save globally**
   - Update shared types: `FeedbackAction = "like" | "dislike" | "skip"` only.
   - Update API validation (`/feedback`) to reject `save`.
   - Remove Saved view/filter in `/items` and any UI hooks or view enums relying on it.
   - Update CLI review UX: remove save keybinding, labels, and handling.
   - Update analytics summaries and any code that counts `save`.

5. **Web UI**
   - Add new page: `packages/web/src/app/app/deep-dive/page.tsx` (route `/app/deep-dive`).
   - Add nav item “Deep Dive”.
   - UI structure:
     - Tabs: **To Review** (queue), **Promoted** (with summaries).
     - Each “To Review” card has:
       - item metadata + link
       - textarea (paste content), live char counter, max‑length warning
       - **Summarize** button (calls preview)
       - Summary preview + actions: **Promote** / **Drop**
     - Promoted tab shows the summary layout (not the fast Feed card layout).
     - Warning banner: “Paste only content you have the right to share with a third‑party AI. Raw content is not stored.”

6. **Web feed simplification**
   - Remove the **Save** button from `FeedbackButtons`.
   - Remove the **Saved** tab from `/app/feed` and any i18n text for it.

7. **Docs**
   - Update `docs/spec.md` (Stage‑2 manual summary flow).
   - Update `docs/web.md` (new page surface + warning).
   - Update `docs/cli.md` and any docs mentioning save as a feedback action.

## Acceptance criteria

- [ ] “Deep Dive” page exists with **To Review** + **Promoted** tabs.
- [ ] User can paste content, run summary, and choose **Promote** or **Drop**.
- [ ] Raw pasted text is **not stored**; promoted summaries are stored and visible.
- [ ] Feedback actions are **like / dislike / skip only** across web/API/CLI; Saved view removed.
- [ ] Budget gating blocks preview when credits are exhausted (matches `ask.ts`).
- [ ] `pnpm -r typecheck` passes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm dev:api
pnpm dev:web
# Web smoke test:
# 1) Like an item in /app/feed
# 2) Go to /app/deep-dive → To Review should show it
# 3) Paste text, Summarize → see preview
# 4) Promote → item moves to Promoted tab
# 5) Drop → item disappears from queue and does not appear in Promoted
```

## Commit

- **Message**: `feat(deep-dive): add manual summary + promote/drop flow`
- **Files expected**:
  - `packages/db/migrations/*`
  - `packages/db/src/repos/*`
  - `packages/api/src/routes/*`
  - `packages/llm/src/*`
  - `packages/web/src/app/app/deep-dive/page.tsx`
  - `packages/web/src/components/*`
  - `packages/web/src/lib/*`
  - `packages/web/src/messages/en.json`
  - `packages/shared/src/types/*`
  - `docs/spec.md`
  - `docs/data-model.md`
  - `docs/llm.md`
  - `docs/web.md`

## Final step (required): write task report files (no copy/paste)

After committing, write a short task report to:

- `docs/tasks/results/latest.md` (overwrite each task)

If you execute multiple tasks back-to-back, also write a single end-of-run recap to:

- `docs/tasks/results/final-recap.md` (overwrite once at the end)

Then print only the file path(s) you wrote (so the driver can open them), e.g.:

```text
WROTE REPORT: docs/tasks/results/latest.md
WROTE FINAL RECAP: docs/tasks/results/final-recap.md
```
