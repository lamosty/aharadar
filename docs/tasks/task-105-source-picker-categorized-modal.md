# Task 105 — `feat(web): replace source type <select> with categorized picker modal`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human

### Goal

Refactor the “add source” UX to scale to dozens of connectors by replacing the source-type `<select>` with a searchable, categorized **modal picker**. Paid/BYO-key sources should be **less prominent** (hidden by default), and “budget-sensitive” sources (e.g. X via Grok) should be clearly labeled.

### Read first (contracts + code)

- `AGENTS.md` (topic-agnostic invariant: UI categories must not affect ranking logic)
- `docs/spec.md` (topic-agnostic; sources are user-chosen)
- `docs/connectors.md` (what source types exist)
- `packages/web/src/app/app/admin/sources/page.tsx` (current add-source flow)
- `packages/web/src/app/app/topics/page.tsx` (topic-level add-source flow)
- `packages/web/src/lib/api.ts` (`SUPPORTED_SOURCE_TYPES`)

### Scope (allowed files)

- `packages/web/src/app/app/admin/sources/page.tsx`
- `packages/web/src/app/app/topics/page.tsx`
- `packages/web/src/lib/api.ts` (if needed for typing only; avoid changing contracts)
- New files under:
  - `packages/web/src/components/SourcePicker/`
  - `packages/web/src/lib/source_catalog.ts`
  - `packages/web/src/components/SourcePicker/*.module.css`
- `packages/web/src/messages/en.json` (copy changes)

If anything else seems required, **stop and ask** before changing.

### Decisions (record Driver answers in this section before implementation)

- **Paid source visibility default**: **hide paid sources behind “Show paid sources”**. ✅ decided
- **Category taxonomy**: use broad, human-friendly categories including domain-y buckets (e.g. **Finance**, **Tech**, **Forums**, etc.). ✅ decided
  - Important: categories are UX-only and MUST NOT affect pipeline logic/ranking.
- **Where to use the picker**:
  - at minimum: `/app/admin/sources` + `/app/topics` ✅ decided
  - optionally: any other “add source” entry points

### Implementation steps (ordered)

1. **Introduce a Source Catalog (single source of truth for UI metadata)**
   - Create `packages/web/src/lib/source_catalog.ts` exporting:
     - `SourceCatalogEntry` type:
       - `{ sourceType, name, description, category, tags, isPaid, isExperimental, isBudgetSensitive, costHint?, requiresKeyProviders?: string[] }`
     - `SOURCE_CATALOG: Record<SupportedSourceType, SourceCatalogEntry>`
   - Keep catalog topic-agnostic: categories/tags are UX-only; do not affect pipeline behavior.
   - Mark paid-ish sources (e.g. `options_flow`, possibly `congress_trading` when configured to paid vendor) with `isPaid=true`.
   - Mark budget-sensitive sources (e.g. `x_posts`, `signal`) with `isBudgetSensitive=true` and a short `costHint` (e.g. “Uses Grok credits”).

2. **Create the modal picker component**
   - New component `packages/web/src/components/SourcePicker/SourceTypePickerModal.tsx`:
     - Search input (filters by name/description/tags)
     - Category tabs or left sidebar (filters by category)
     - List of sources with name + short description
     - Badges:
       - “Paid” badge + optional “Requires API key” note
       - “Budget-sensitive” badge + short cost hint tooltip
     - Toggle: “Show paid sources”
     - Visual quality: match the existing app UI; aim for a clean 2025/2026 “settings modal” feel (spacing, typography, subtle hover states).
   - Accessibility:
     - Focus trap, ESC to close, click-outside closes
     - Keyboard navigation (up/down, enter select)

3. **Wire into Admin Sources page**
   - Replace the `<select>` for source type in `packages/web/src/app/app/admin/sources/page.tsx` with:
     - a button “Choose source type”
     - opens modal; selection sets `createType`
   - Preserve existing behavior: config form rerenders based on `createType`.

4. **Wire into Topics page add-source flow**
   - Apply the same picker on `packages/web/src/app/app/topics/page.tsx` add-source form.

5. **Copy updates**
   - Update `packages/web/src/messages/en.json` as needed for new strings.

### Acceptance criteria

- [ ] Admin `/app/admin/sources` can add a source using the new modal picker.
- [ ] Topics `/app/topics` can add a source using the new modal picker.
- [ ] Sources are grouped by category and searchable.
- [ ] Paid sources are **hidden by default** and only appear when “Show paid sources” is enabled.
- [ ] Budget-sensitive sources are clearly labeled (badge + hint).
- [ ] `pnpm --filter @aharadar/web typecheck` passes.

### Test plan (copy/paste commands)

```bash
pnpm --filter @aharadar/web typecheck
```

### Commit

- **Message**: `feat(web): categorized source picker modal`
- **Files expected**:
  - `packages/web/src/app/app/admin/sources/page.tsx`
  - `packages/web/src/app/app/topics/page.tsx`
  - `packages/web/src/lib/source_catalog.ts` (new)
  - `packages/web/src/components/SourcePicker/SourceTypePickerModal.tsx` (new)
  - `packages/web/src/components/SourcePicker/*.module.css` (new)
  - `packages/web/src/messages/en.json` (maybe)
