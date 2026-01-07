# Task 034 — `docs(web): define UI routes + UX requirements`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Write a concise UI/UX spec that Opus can implement without guessing:

- route map (marketing + app)
- required screens and key interactions
- performance/a11y/i18n/offline expectations (MVP)
- API data needs (what endpoints must exist)

This is a docs-only task.

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/spec.md`
- `docs/pipeline.md`
- `docs/api.md`
- `docs/connectors.md` (what data exists; “why shown” features live in `triage_json.system_features`)

## Scope (allowed files)

- new: `docs/web.md` (or `docs/ui.md` — pick one and stick to it)
- (optional) `docs/api.md` (only if you need to clarify endpoint contracts)

If anything else seems required, **stop and ask**.

## Decisions (already decided — do not re-ask)

- Frontend stack:
  - **Option A (chosen)**: Next.js for both marketing + app (single web frontend for now).
  - **Note (future)**: We may move only the marketing site to [Astro](https://astro.build/) later for content/SEO performance, while keeping the app in Next.js. Keep design tokens/branding portable to support that.
- **Ship all screens** in v1:
  - landing page
  - app/dashboard shell
  - digests list + digest detail
  - item detail
  - feedback actions
  - admin “run now”
  - sources/cadence/weights admin UI
  - budgets status UI
- **Expose “why shown”** breakdown in UI now.
- **Auth**:
  - implement login UI only (no backend auth yet)
  - prefer “email magic link” as the eventual auth UX (design only)
- **UX**:
  - skeleton loading + optimistic feedback updates
  - basic offline/poor-network handling now (improve later)
- **i18n**: scaffold only (English now; don’t paint into a corner)
- **Dark mode**: yes (toggle)
- **Design exploration (early dev)**:
  - ship **2–3 distinct visual themes** (not just light/dark) so the driver can choose
  - implement themes as tokenized “theme packs” (CSS variables) so swapping is low-churn
  - ship **3 distinct layout templates** (different component/markup structures) for core pages so the driver can choose an information architecture feel:
    - Condensed (dense/table-ish)
    - Reader (cards/editorial)
    - Timeline (feed/timeline)
  - app shell navigation should be designed for future layout variants:
    - not required to implement multiple nav layouts in v1
    - but the architecture should make it easy to add sidebar vs top-nav vs mobile-bottom-nav later without refactoring page code
- **E2E tests**: yes, Playwright from day 1
- **Deployment**: target is a Hetzner Ubuntu server (Docker-based)

## Implementation steps (ordered)

1. Create `docs/web.md` with:
   - Product UI goal (1 paragraph)
   - Route map (marketing vs app)

- Future note: “Astro for marketing later” (what would need to be kept portable: tokens, typography, icons, brand)
- Screen-by-screen requirements (bulleted)
- A11y/perf requirements checklist (MVP)
- Loading/offline behaviors
- “View density” toggle: condensed vs reader mode behavior
- Theming plan:
  - “theme pack” concept (2–3 options)
  - how to select/persist theme (local only for now)
- Layout plan:
  - “layout pack” concept (3 options above)
  - requirement: different component trees/HTML structures (not just CSS)
  - how to select/persist layout
- App shell/nav plan:
  - define a `NavModel` (routes + labels + icons) consumed by all nav variants
  - define a `NavVariant` concept (e.g. sidebar/top/bottom) even if only one is implemented initially
  - require that pages do not depend on a specific nav structure (only on shared layout slots)
- “Why shown” UX requirements (what to show from `system_features`)
- API data needs (list endpoints; mark existing vs required-to-add)
- Test strategy (unit vs Playwright; keep `pnpm test` hermetic)

2. Keep it topic-agnostic and vendor-agnostic.

## Acceptance criteria

- [ ] A developer can implement the UI without guessing routes/behaviors.
- [ ] The doc lists the required API endpoints needed for feature completeness.
- [ ] No code changes.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
```

## Commit

- **Message**: `docs(web): define UI routes + UX requirements`
- **Files expected**:
  - `docs/web.md` (or `docs/ui.md`)

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
