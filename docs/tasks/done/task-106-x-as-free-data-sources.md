# Task 106 — `feat(web,docs): make X (via Grok) a first-class “data source” path (x_posts-first) + starter packs`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high (architect/reviewer)
- **Driver**: human

### Goal

Make it explicit in the UI/UX that **X/Twitter via Grok** can be used to track many “specialized data feeds” (including things that are otherwise behind paid APIs), primarily by configuring **`x_posts`** sources.

Also add curated **starter packs** (driver-approved, domain-specific allowed) to speed up setup, while ensuring:

- no scraping (only via our provider abstraction)
- clear “budget-sensitive” messaging (Grok usage consumes credits)

### Read first (contracts + code)

- `AGENTS.md` (topic-agnostic; provider-agnostic; no ToS violations)
- ADR: `docs/adr/0010-x-posts-canonical-via-grok.md`
- `docs/connectors.md` sections:
  - `x_posts` (canonical)
  - `signal` (bundle-only amplifier)
- `packages/web/src/components/SourceConfigForms/XPostsConfigForm.tsx`
- `packages/web/src/components/SourceConfigForms/SignalConfigForm.tsx`
- `packages/web/src/app/app/admin/sources/page.tsx` (add-source UX)

### Scope (allowed files)

- `packages/web/src/components/SourceConfigForms/XPostsConfigForm.tsx`
- `packages/web/src/components/SourceConfigForms/SignalConfigForm.tsx`
- `packages/web/src/components/SourceConfigForms/types.ts`
- `packages/web/src/components/SourceConfigForms/SourceConfigForm.tsx` (only if needed for defaults)
- `packages/web/src/lib/source_catalog.ts` (from Task 105; if already merged)
- New files under:
  - `packages/web/src/lib/source_recipes.ts`
  - `packages/web/src/lib/source_starter_packs.ts`
  - `packages/web/src/components/SourcePicker/` (only if integrating into picker UX)
- `docs/connectors.md` (documentation copy only)
- `packages/web/src/messages/en.json` (copy changes)

If anything else seems required, **stop and ask** before changing.

### Decisions (record Driver answers in this section before implementation)

- **Primary path**: **`x_posts`** (canonical items shown in feed/digests). ✅ decided
- **Domain-specific starter packs in-repo**: **Yes (small curated list)**, plus users can always add their own manually. ✅ decided
- **Where to surface “X as data”**: **inside the new Source Picker modal** (best discoverability). ✅ decided
- **Budget messaging**: **Yes, call out budget sensitivity** for Grok-backed X sources. ✅ decided

### Implementation steps (ordered)

1. **Add “recipes” as a fast path (generic)**
   - Create `packages/web/src/lib/source_recipes.ts` exporting a small list of generic recipes:
     - `Follow accounts` → creates an `x_posts` source with `accounts=[]` (user fills)
     - `Monitor keywords` → creates an `x_posts` source with `keywords=[]`
     - `Advanced query` → creates an `x_posts` source with `queries=[]`
     - Optional: `Signal bundles (amplifier)` → creates a `signal` source with `provider="x_search"`, `vendor="grok"` (advanced)
   - Recipes must contain:
     - `id`, `title`, `description`, `sourceType`, `defaultName`, `defaultConfig`

2. **Add curated starter packs (driver-approved, domain-specific allowed)**
   - Create a new list of starter packs (implementation detail is flexible):
     - Either extend `source_recipes.ts`, or create `packages/web/src/lib/source_starter_packs.ts`.
   - Each starter pack MUST be explicit and user-initiated (no auto-enabling):
     - `id`, `title`, `description`, `category`, `sourceType` (usually `x_posts`), `defaultName`, `defaultConfig`
   - Include at least one starter pack that demonstrates the idea of “free alternative to paid data APIs” via public X accounts (driver can handpick accounts; implementer should not invent private/unsafe sources).
   - Add a clear disclaimer in UI copy: “These are convenience presets; verify accuracy; not official data.”

3. **UX: make “X as data” discoverable (x_posts-first)**
   - Add a short callout in `XPostsConfigForm` and `SignalConfigForm`:
     - Explain: “Many specialized communities publish structured data publicly; you can track those posts here.”
     - Clarify semantics:
       - `x_posts` = canonical items that appear in the feed/digests
       - `signal` = bundle-only amplifier/debug (not shown as items)
     - Add explicit budget note:
       - “Budget-sensitive: uses Grok credits. Reduce accounts/keywords and max results to control spend.”
   - Add helper inputs to reduce friction:
     - “Paste accounts” textarea: accepts newline/comma separated values; normalizes to array
     - Same for keywords and queries

4. **Integrate recipes + starter packs into the Source Picker**
   - If Task 105 exists/merged, add a “Recipes / Starter packs” tab (or section) to the picker modal.
   - Selecting an entry should pre-fill:
     - source type (`x_posts` primarily),
     - suggested name,
     - config (accounts/keywords/queries).
   - Include badges:
     - “Budget-sensitive” for X/Grok sources,
     - “Paid” only if an entry depends on a paid provider (avoid for these packs).

5. **Docs**
   - Update `docs/connectors.md` with an explicit note under `x_posts` and/or `signal`:
     - “X can serve as a cheap/free alternative to paid data APIs when information is posted publicly by accounts.”
     - Reinforce: no scraping; uses provider abstraction; respect budgets.

### Acceptance criteria

- [ ] UI explicitly communicates “X as data source” primarily via `x_posts`.
- [ ] User can paste a list of accounts/keywords/queries and it correctly populates config arrays.
- [ ] Recipes + starter packs can pre-fill the add-source form reliably.
- [ ] Budget-sensitive messaging is present anywhere X/Grok sources are suggested/selected.
- [ ] `pnpm --filter @aharadar/web typecheck` passes.

### Test plan (copy/paste commands)

```bash
pnpm --filter @aharadar/web typecheck
```

### Commit

- **Message**: `feat(web): make X (via Grok) a first-class data-source path`
- **Files expected**:
  - `packages/web/src/components/SourceConfigForms/XPostsConfigForm.tsx`
  - `packages/web/src/components/SourceConfigForms/SignalConfigForm.tsx`
  - `packages/web/src/components/SourceConfigForms/types.ts` (maybe)
  - `packages/web/src/lib/source_recipes.ts` (new)
  - `packages/web/src/lib/source_starter_packs.ts` (new)
  - `docs/connectors.md` (maybe)
  - `packages/web/src/messages/en.json` (maybe)
