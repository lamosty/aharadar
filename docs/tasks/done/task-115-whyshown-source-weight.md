# Task 115: WhyShown Source Weight breakdown

## Priority: Medium

## Goal

Make the **Source Weight** section in WhyShown accurate and informative by showing the full breakdown:

- Source type weight (global)
- Per-source weight (config)
- Effective combined weight

## Problem

The UI expects fields that don’t exist (`source_name`) and hides values when weights are neutral. This results in an empty or confusing Source Weight section.

## Background

Ranking applies:

```
effective_weight = clamp(type_weight * source_weight, 0.1, 3.0)
```

Where:

- `type_weight` = global weight for the source **type** (env-configured)
- `source_weight` = per-source weight configured by the user

## Requirements

### 1) Pipeline: Include all weights in triage_json

Ensure `system_features.source_weight_v1` includes:

```ts
{
  source_type: string;
  type_weight: number;
  source_weight: number;
  effective_weight: number;
  source_name?: string; // optional but preferred if easy
}
```

If source_name is easy to wire (the candidate already has `sourceName`), include it.

### 2) Web: Render the full breakdown

In WhyShown:

- Always show `type_weight`, `source_weight`, and `effective_weight`
- Use clear labels:
  - “Type weight”
  - “Source weight”
  - “Effective weight”
- Show `source_name` if present; otherwise omit that row

### 3) Fix mocks/tests

Align mock data and fixtures with the real schema:

- `packages/web/src/lib/mock-data.ts`
- `packages/web/e2e/fixtures.ts`
- `packages/web/e2e/feed.spec.ts` (if needed)

## Files to Modify

- `packages/pipeline/src/stages/rank.ts` (include weights + optional source_name)
- `packages/pipeline/src/stages/digest.ts` (pass sourceName into weight feature)
- `packages/web/src/components/WhyShown/WhyShown.tsx` (render breakdown)
- `packages/web/src/messages/en.json` (labels)
- `packages/web/src/lib/mock-data.ts`
- `packages/web/e2e/*` (fixtures/tests)

## Acceptance Criteria

- Source Weight section consistently shows type/source/effective weights.
- No empty Source Weight blocks.
- Mocked and test fixtures match the real schema.
- `pnpm typecheck` passes.
