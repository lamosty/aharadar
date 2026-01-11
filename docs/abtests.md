# Aha Radar — AB Tests

This document describes the AB-test subsystem for comparing triage behavior across different LLM provider/model configurations.

## Purpose

AB tests enable side-by-side comparison of how different LLM models score the same content items. This helps answer questions like:

- Does a more expensive model produce meaningfully different triage scores?
- How does reasoning_effort affect output quality?
- What's the cost/quality tradeoff between providers?

## Concepts

### Run

An `abtest_run` represents a single experiment comparing multiple LLM configurations against a fixed set of content items within a time window.

**Lifecycle:**
1. `pending` — run created, not yet started
2. `running` — processing items through each variant
3. `completed` — all items processed successfully
4. `failed` — run aborted due to error

### Variant

An `abtest_variant` is one LLM configuration to test. Each run has 2+ variants (e.g., "claude-3-5-haiku" vs "gpt-4o-mini").

Fields:
- `provider` — LLM provider (anthropic, openai, xai, google, etc.)
- `model` — model identifier
- `reasoning_effort` — optional (`none|low|medium|high`) for models that support it; `none` disables reasoning
- `max_output_tokens` — token limit for response
- `order` — display ordering (1, 2, 3, ...)

### Item

An `abtest_item` is a content item (or cluster representative) to be triaged by each variant. Items are snapshots—they store the content at run time so results remain meaningful even if the original is deleted.

Snapshot fields:
- `cluster_id` / `content_item_id` — link to original (nullable if deleted)
- `representative_content_item_id` — for clusters, the representative item
- `source_id` / `source_type` — source provenance
- `title` / `url` / `author` / `published_at` / `body_text` — content snapshot

### Result

An `abtest_result` stores the triage output from one variant for one item.

Fields:
- `triage_json` — the structured triage response (aha_score, reasoning, etc.)
- `input_tokens` / `output_tokens` — token usage
- `status` — "ok" or "error"
- `error_json` — error details if failed

## Data Model

See `docs/data-model.md` for full DDL. Summary:

| Table | Purpose |
|-------|---------|
| `abtest_runs` | One row per experiment |
| `abtest_variants` | LLM configs to compare (2+ per run) |
| `abtest_items` | Content items to triage (with snapshot) |
| `abtest_results` | Per-item, per-variant triage output |

## Usage Patterns

### Creating a run

1. Select a topic and time window
2. Define 2+ variants (provider/model combos)
3. Sample content items (clusters or individual items) from the window
4. Create the run with variants and items

### Executing a run

For each item × variant combination:
1. Call triage with the variant's LLM config
2. Store result (triage_json, tokens, status)
3. Update run status on completion/failure

### Browsing results

- List recent runs by user
- Get run detail: run metadata + variants + items + results
- Compare scores across variants for the same item
- Aggregate statistics (avg scores, token usage, error rates)

## Cost Considerations

AB tests are inherently costly—each item is triaged N times (once per variant). Recommendations:

- Sample items rather than testing entire windows
- Use smaller time windows for initial experiments
- Start with 2 variants before testing many configurations
- Track token usage via `abtest_results.input_tokens/output_tokens`
