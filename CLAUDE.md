# Claude Code Instructions

Topic-agnostic personalized content aggregation + ranking system.
Core loop: ingest → normalize → dedupe/cluster → triage → rank → enrich → digest → feedback.

## Before coding

1. Read the latest recap in `docs/recaps/`
2. Check open tasks in `docs/tasks/`
3. Check relevant docs in `docs/` (spec, architecture, data-model, pipeline)
4. Confirm contracts in docs/code before changing anything

## How to work

- **Commit-sized chunks**: small, reviewable, coherent changes
- **Don't guess**: confirm contracts in docs; if unclear, propose options and ask
- **Consistency over cleverness**: keep interfaces stable; avoid special cases

## Commands

```bash
pnpm dev:services     # Start Postgres+Redis (Docker)
pnpm build            # Build all packages
pnpm dev              # Build + run CLI
pnpm dev:api          # Build + run API server (reads .env)
pnpm dev:web          # Run Next.js dev server
pnpm dev:worker       # Build + run scheduler worker
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

## Experimental philosophy

This app is highly experimental. Value of features can't be known until tested in real usage.

**Build → Ship off → Test locally → Measure → Decide**

- **New features**: ship disabled/off by default via config flags
- **Costly features** (extra LLM calls, API usage): must be opt-in
- **Local testing first**: use Claude Code subscription ($100/month) for local experimentation before enabling for API usage
- **No premature optimization**: build the simple version, see if it works, then iterate

Example config pattern for experimental features:

```typescript
{
  "experimental": {
    "feature_name": false,  // Off by default
    "feature_model": "haiku"  // Cheap model when enabled
  }
}
```

Don't over-engineer features before proving value. Ship toggleable, test locally, measure real-world impact.

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

Write handoff recap to `docs/recaps/recap-YYYY-MM-DDTHHMMZ-<slug>.md`

## Key docs

- `docs/spec.md` — master spec
- `docs/architecture.md` — system design
- `docs/data-model.md` — DB schema
- `docs/pipeline.md` — stages + ranking
- `docs/connectors.md` — connector contracts
- `docs/adr/*` — decisions

## Key locations

- `docs/tasks/` — open task files
- `docs/recaps/` — session recaps
- `docs/adr/` — architecture decisions

## Testing utilities

### Auth Bypass (dev only)

For Playwright/manual testing, bypass frontend auth via cookie:

```javascript
// In browser console:
document.cookie = "BYPASS_AUTH=admin; path=/"; // Test as admin user
document.cookie = "BYPASS_AUTH=user; path=/"; // Test as regular user
document.cookie = "BYPASS_AUTH=; path=/"; // Disable bypass
```

**Safety notes:**

- Only bypasses frontend redirect (middleware.ts), NOT API authentication
- API calls still require valid session or will fail with 401/403
- Creates mock user object (id: "test-user-id") - won't work for user-specific DB operations
- Safe for local dev; in production, real auth flow is required
- Implementation: `packages/web/src/middleware.ts` + `AuthProvider.tsx`
