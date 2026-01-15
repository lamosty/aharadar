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

## Decisions (locked)

1. **Debug toggle location**
   - Use Settings > Experimental (experimental feature toggle).
2. **Visibility gating**
   - Add an env flag that controls whether the experimental toggle is shown at all.
   - Proposed name: `NEXT_PUBLIC_SCORE_DEBUG_ENABLED` (default: false).
   - If the env flag is off, hide the feature toggle and never show debug tooltips.
3. **Persist debug payload**
   - Always persist `score_debug_v1` inside `triage_json.system_features`.
   - The env flag only controls UI visibility, not storage.
4. **Heuristic subcomponents**
   - Expose as much as possible: include `recency01` and `engagement01` and their weights.
   - If plumbing becomes heavy, ask before omitting.

## Scope (allowed files)

- `packages/pipeline/src/stages/rank.ts`
- `packages/pipeline/src/stages/digest.ts` (only if needed to pass extra debug inputs)
- `packages/web/src/components/Feed/FeedItem.tsx`
- `packages/web/src/components/Feed/FeedItem.module.css` (if tooltip layout needs styling)
- `packages/web/src/components/ExperimentalFeatures/ExperimentalFeatures.tsx` (if UI gating needs tweaks)
- `packages/web/src/components/WhyShown/WhyShown.tsx` (optional)
- `packages/web/src/lib/experimental.ts`
- `packages/web/src/messages/en.json`
- `packages/web/src/lib/mock-data.ts`
- `docs/pipeline.md` (document new debug feature field)

If anything else seems required, stop and ask before changing.

## Implementation steps (ordered)

### 1) Add experimental toggle for score debugging (gated by env)

- Add a new experimental feature flag key: `score_debug`.
- Gate feature visibility on `NEXT_PUBLIC_SCORE_DEBUG_ENABLED`:
  - If false/undefined, do not show the toggle and force debug mode off in UI.
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
    ai_score,          // 0-100
    aha01,             // ai_score / 100
    heuristic_score,   // 0-1
    recency01,         // 0-1 (from digest heuristic inputs)
    engagement01,      // 0-1 (from digest heuristic inputs)
    preference_score,  // pos - neg (clamped -1..1)
    novelty01,         // 0-1
    signal01,          // 0 or 1
  },
  heuristic_weights: { w_recency, w_engagement },
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
- Recency + engagement come from the heuristic inputs in `digest.ts`; plumb them into rank
  inputs so they can be included in the debug payload.

### 3) Update UI types to recognize debug payload

- Extend `TriageFeatures` in `packages/web/src/lib/mock-data.ts` to include
  `system_features.score_debug_v1` with the fields above.

### 4) Add debug tooltip content in feed

In `packages/web/src/components/Feed/FeedItem.tsx`:

- When `score_debug` experimental flag is enabled (and env flag allows it) AND `score_debug_v1` exists,
  render a richer tooltip instead of the single-line text.
- Keep the existing tooltip text when debug is off or debug data is missing.
- Use a small, scannable layout (2 columns or stacked lines).
- Suggested fields to show:
  - Final Aha Score (0-100) and raw 0-1
  - AI score
  - Heuristic score
  - Recency + engagement
  - Preference score
  - Novelty score
  - Weights (w_aha, w_heuristic, w_pref, w_novelty, w_signal)
  - Heuristic weights (w_recency, w_engagement)
  - Multipliers (source, preference, decay)

If needed, add minimal styles in `FeedItem.module.css` or `Tooltip.module.css` for spacing.

### 5) (Optional) WhyShown advanced debug block

If it fits, add a compact "Score Debug" row in the WhyShown advanced table when
debug mode is enabled. This is optional but can be useful for power users.

### 6) Docs

Update `docs/pipeline.md` to mention `system_features.score_debug_v1` as an optional
debug payload for transparency.

## Acceptance criteria

- [ ] When `NEXT_PUBLIC_SCORE_DEBUG_ENABLED=true`, Settings > Experimental shows a "Score Debug Mode" toggle.
- [ ] When the env flag is off, the toggle and debug tooltip never appear.
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
