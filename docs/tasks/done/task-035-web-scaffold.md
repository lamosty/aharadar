# Task 035 — `feat(web): scaffold Next.js app + design system + shell`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Create a production-grade web app scaffold that is:

- fast and responsive (mobile-first)
- accessible (keyboard + screen reader friendly)
- SEO-capable (landing page)
- ready for future auth (login UI only for now)

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/web.md` (from Task 034)
- `docs/api.md`
- UI inspiration guideline (if available): `frontend-design` skill doc

## Scope (allowed files)

- new: `packages/web/**`
- root: `package.json` (scripts only), `pnpm-workspace.yaml` (if needed)

If anything else seems required, **stop and ask**.

## Decisions (already decided — do not re-ask)

- Framework: **React + Next.js (App Router)** for SSR/SEO and app UX.
- Package name: `packages/web` (workspace package `@aharadar/web`).
- Marketing note: build the landing page in Next.js for now; we may move marketing-only pages to [Astro](https://astro.build/) later. Keep tokens portable (CSS variables) so a future split is low-churn.
- Themes:
  - light + dark (toggle)
  - layout mode toggle: **Condensed** vs **Reader** vs **Timeline** (different markup/templates on key pages)
  - **2–3 distinct “theme packs”** (aesthetic variants) implemented via CSS tokens, to allow choosing a direction in early dev
- Auth: **UI-only** (email magic link design), no backend yet.
- i18n: scaffold only.

## Implementation steps (ordered)

1. Scaffold `packages/web` with Next.js + TypeScript.
2. Add an intentional design system:
   - CSS variables for colors/spacing/typography
   - **theme packs**: implement 3 distinct presets (name them) with noticeably different typography + palette + surface styling (still serious/trustworthy)
   - dark mode + density toggle persisted locally
   - theme selection persisted locally (localStorage is fine for MVP)
   - a11y-friendly focus styles and skip-to-content
   - avoid generic “AI slop” aesthetics; use the `frontend-design` skill to propose and implement 3 options the driver can choose from
3. Implement routes:
   - `/` marketing landing page (SEO metadata)
   - `/app` dashboard shell (nav + placeholders)
   - `/login` login UI (magic-link form, no backend call yet)
4. Add basic layout primitives/components:
   - App shell with responsive nav
     - implement a slot-based `AppShell` / layout component so nav can be swapped later (sidebar/top/bottom) without refactoring page code
     - define a `NavModel` (routes + labels + icons) and keep it separate from presentation
   - Toast/notice component for errors (can be simple initially)
   - Appearance switcher UI (can be small):
     - Theme pack selector (3 options)
     - Light/dark toggle
     - Layout mode selector (Condensed / Reader / Timeline)
5. Add i18n scaffold:
   - central place for strings (e.g., `messages/en.json` + `t(key)` helper)
6. Add scripts:
   - root `pnpm dev:web` (or similar) to run web dev server

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] `pnpm -r build` passes.
- [ ] Web app runs locally (`pnpm dev:web`) with landing page and app shell.
- [ ] Theme pack selector works and persists (3 distinct themes).
- [ ] Dark mode + density toggle work and persist.
- [ ] Layout mode selector persists (even if full page templates land in later tasks).
- [ ] Basic a11y: keyboard navigation, visible focus, semantic headings.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build

# run web (command may vary based on implementation)
pnpm dev:web
```

## Commit

- **Message**: `feat(web): scaffold Next.js app + design system + shell`
- **Files expected**:
  - `packages/web/**`
  - (optional) root `package.json` scripts

## Final step (required): write task report files (no copy/paste)

Follow `docs/workflows/task-template.md`.
