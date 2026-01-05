# Claude Code Instructions

Topic-agnostic personalized content aggregation + ranking system.
Core loop: ingest → normalize → dedupe/cluster → triage → rank → enrich → digest → feedback.

## Before coding

1. Read the latest recap in `docs/sessions/recaps/`
2. Check relevant docs in `docs/` (spec, architecture, data-model, pipeline)
3. Confirm contracts in docs/code before changing anything

## How to work

- **Commit-sized chunks**: small, reviewable, coherent changes
- **Don't guess**: confirm contracts in docs; if unclear, propose options and ask
- **Consistency over cleverness**: keep interfaces stable; avoid special cases

## Commands

```bash
pnpm dev:services     # Start Postgres+Redis (Docker)
pnpm build            # Build all packages
pnpm dev              # Build + run CLI
pnpm typecheck        # TypeScript strict check
pnpm format           # Prettier
pnpm migrate          # Run DB migrations
pnpm reset            # Reset DB
```

## Non-negotiables

- **Topic-agnostic**: no domain-specific logic; generic ranking/prompting only
- **Provider-agnostic**: `(provider, model)` selection; vendor-neutral interfaces
- **Budget correctness**: enforce monthly + daily throttle; when exhausted → warn + fallback to `low`
- **TypeScript strict**: no implicit `any`
- **No secrets committed**: use `.env` locally
- **No premature fallbacks** (early-phase velocity):
  - Fix root cause over adding multi-path logic
  - Surface tradeoffs; let human decide
  - No backward-compat for old DB rows unless explicitly requested
  - Only add fallbacks when required by spec/ADR

## Coding conventions

- Files: `snake_case.ts` (pipeline stages)
- Types: `PascalCase`, functions/vars: `camelCase`
- Structured errors; don't swallow silently

## Done criteria

- Behavior matches spec/ADR
- Types pass strict check
- Docs updated if contracts changed

## Commits

Conventional commits: `feat|fix|docs|refactor|chore|test(<scope>): message`

One logical change per commit. After finishing:
1. Summary of changes
2. Suggested commit with file list and copy/paste commands

## Long sessions

Write handoff recap to `docs/sessions/recaps/recap-YYYY-MM-DDTHHMMZ-<slug>.md`

## Key docs

- `docs/spec.md` — master spec
- `docs/architecture.md` — system design
- `docs/data-model.md` — DB schema
- `docs/pipeline.md` — stages + ranking
- `docs/connectors.md` — connector contracts
- `docs/adr/*` — decisions

## Collaboration workflow (Opus implementer + GPT reviewer)

- `docs/workflows/ai-collab.md`
- `docs/_session/opus-worklist.md`
