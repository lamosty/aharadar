# Task 148 — `feat(web): add score debug breakdown tooltip + debug mode toggle`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT-5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Add a debug mode that reveals the exact Aha Score breakdown (inputs, weights, and multipliers)
when hovering the score tooltip in the feed. This should make it obvious why an item with a
lower AI score or lower decay can still rank higher.

## Read first (required)

- `AGENTS.md`
- `docs/pipeline.md` (ranking formula)
- `docs/llm.md` (triage output shape)
- Code:
  - `packages/pipeline/src/stages/rank.ts`
  - `packages/pipeline/src/stages/digest.ts`
  - `packages/web/src/components/Feed/FeedItem.tsx`
  - `packages/web/src/components/Tooltip/Tooltip.tsx`
  - `packages/web/src/components/WhyShown/WhyShown.tsx` (optional debug section)
  - `packages/web/src/lib/experimental.ts`
  - `packages/web/src/messages/en.json`
  - `packages/web/src/lib/mock-data.ts`

## Decisions (ask driver if unclear)

1. **Where to toggle debug mode**
   - Default: add an Experimental feature toggle named `score_debug` in Settings > Experimental.
   - Alternative: add to Dev Settings instead. If preferred, ask before implementing.
2. **Persist debug fields always vs gated**
   - Default: always persist `score_debug_v1` inside `triage_json.system_features` (UI only reveals it when debug mode is on).
   - Alternative: only include debug fields when an env flag is set.
3. **Heuristic subcomponents**
   - Default: include only `heuristic_score` (0-1).
   - Optional: also include `recency` + `engagement` components if simple to plumb through.

## Scope (allowed files)

- `packages/pipeline/src/stages/rank.ts`
- `packages/pipeline/src/stages/digest.ts` (only if needed to pass extra debug inputs)
- `packages/web/src/components/Feed/FeedItem.tsx`
- `packages/web/src/components/Feed/FeedItem.module.css` (if tooltip layout needs styling)
- `packages/web/src/components/WhyShown/WhyShown.tsx` (optional)
- `packages/web/src/lib/experimental.ts`
- `packages/web/src/messages/en.json`
- `packages/web/src/lib/mock-data.ts`
- `docs/pipeline.md` (document new debug feature field)

If anything else seems required, stop and ask before changing.

## Implementation steps (ordered)

### 1) Add experimental toggle for score debugging

- Add a new experimental feature flag key: `score_debug`.
- Update:
  - `packages/web/src/lib/experimental.ts` (types + default + EXPERIMENTAL_FEATURES list)
  - `packages/web/src/messages/en.json` with label/description text
- Label text suggestion: "Score Debug Mode" and "Show detailed score breakdowns in tooltips."

### 2) Emit score breakdown from ranking

In `packages/pipeline/src/stages/rank.ts`, add a new `system_features.score_debug_v1` object
into `triageJson` when triage exists (or always if triageJson exists). Include values derived
from the real scoring math so the UI can display *exact* numbers.

Proposed shape (snake_case):

```ts
score_debug_v1: {
  weights: { w_aha, w_heuristic, w_pref, w_novelty, w_signal },
  inputs: {
    ai_score,        // 0-100
    aha01,           // ai_score / 100
    heuristic_score, // 0-1
    preference_score, // pos - neg (clamped -1..1)
    novelty01,       // 0-1
    signal01,        // 0 or 1
  },
  components: {
    ai: w_aha * aha01,
    heuristic: w_heuristic * heuristic_score,
    preference: w_pref * preference_score,
    novelty: w_novelty * novelty01,
    signal: w_signal * signal01,
  },
  base_score,       // sum of components
  pre_weight_score, // base + any extra boosts (if separate)
  multipliers: {
    source_weight,
    user_preference_weight,
    decay_multiplier,
  },
  final_score,      // pre_weight_score * multipliers
}
```

Notes:

- Use the **actual** numeric values used during scoring (no rounding beyond what is already done).
- If a component does not exist (e.g., no novelty data), set it to 0 instead of omitting.
- If you add optional recency/engagement, include them in `inputs`.

### 3) Update UI types to recognize debug payload

- Extend `TriageFeatures` in `packages/web/src/lib/mock-data.ts` to include
  `system_features.score_debug_v1` with the fields above.

### 4) Add debug tooltip content in feed

In `packages/web/src/components/Feed/FeedItem.tsx`:

- When `score_debug` experimental flag is enabled AND `score_debug_v1` exists,
  render a richer tooltip instead of the single-line text.
- Keep the existing tooltip text when debug is off or debug data is missing.
- Use a small, scannable layout (2 columns or stacked lines).
- Suggested fields to show:
  - Final Aha Score (0-100) and raw 0-1
  - AI score
  - Heuristic score
  - Preference score
  - Novelty score
  - Weights (w_aha, w_heuristic, w_pref, w_novelty, w_signal)
  - Multipliers (source, preference, decay)

If needed, add minimal styles in `FeedItem.module.css` or `Tooltip.module.css` for spacing.

### 5) (Optional) WhyShown advanced debug block

If it fits, add a compact "Score Debug" row in the WhyShown advanced table when
debug mode is enabled. This is optional but can be useful for power users.

### 6) Docs

Update `docs/pipeline.md` to mention `system_features.score_debug_v1` as an optional
debug payload for transparency.

## Acceptance criteria

- [ ] Settings > Experimental includes a "Score Debug Mode" toggle.
- [ ] With debug mode on, hovering the Aha Score shows an exact breakdown of the score math.
- [ ] With debug mode off, tooltip behavior is unchanged.
- [ ] Score breakdown values reflect the real values used in ranking (not recomputed in UI).
- [ ] Docs mention the new `score_debug_v1` field.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm --filter @aharadar/web typecheck
```

## Commit

- **Message**: `feat(web): add score debug tooltip breakdown`
- **Files expected**:
  - `packages/pipeline/src/stages/rank.ts`
  - `packages/pipeline/src/stages/digest.ts` (only if extra inputs passed)
  - `packages/web/src/components/Feed/FeedItem.tsx`
  - `packages/web/src/components/Feed/FeedItem.module.css` (if styling added)
  - `packages/web/src/components/WhyShown/WhyShown.tsx` (optional)
  - `packages/web/src/lib/experimental.ts`
  - `packages/web/src/messages/en.json`
  - `packages/web/src/lib/mock-data.ts`
  - `docs/pipeline.md`

Commit instructions:

```bash
git add packages/pipeline/src/stages/rank.ts \
  packages/pipeline/src/stages/digest.ts \
  packages/web/src/components/Feed/FeedItem.tsx \
  packages/web/src/components/Feed/FeedItem.module.css \
  packages/web/src/components/WhyShown/WhyShown.tsx \
  packages/web/src/lib/experimental.ts \
  packages/web/src/messages/en.json \
  packages/web/src/lib/mock-data.ts \
  docs/pipeline.md
git commit -m "feat(web): add score debug tooltip breakdown"
```

