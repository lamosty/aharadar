# Task 028 — `feat(api): scaffold server + API key auth + health`

- **Owner**: Claude Code Opus 4.5 (implementer)
- **Reviewer**: GPT‑5.2 xtra high
- **Driver**: human (runs commands, merges)

## Goal

Turn `packages/api` from stubs into a runnable minimal HTTP API foundation:

- server entrypoint (`main.ts`)
- API key auth middleware (MVP)
- `GET /api/health` endpoint
- consistent JSON error envelope

## Read first (required)

- `AGENTS.md`
- `CLAUDE.md`
- `docs/api.md` (API contract + auth)
- `docs/data-model.md` (what exists in DB)
- Code:
  - `packages/api/src/main.ts`
  - `packages/api/src/auth/api_key.ts`
  - `packages/api/src/routes/*`
  - `packages/shared/src/config/runtime_env.ts` (`ADMIN_API_KEY`, `DATABASE_URL`)

## Scope (allowed files)

- `packages/api/package.json`
- `packages/api/src/main.ts`
- `packages/api/src/auth/api_key.ts`
- `packages/api/src/routes/*` (add `health.ts` if desired)
- (optional) `packages/api/src/server.ts` (if you want a clean split)

If anything else seems required (DB migrations, cross-package refactors), **stop and ask**.

## Decisions

- **Already decided (spec)**:
  - Auth is **API key header**:
    - client sends `X-API-Key: <key>`
    - server reads `ADMIN_API_KEY` from env (see `packages/shared/src/config/runtime_env.ts`)
  - No OAuth/sessions for MVP (see `docs/api.md` Non-goals)
- **Already decided (driver)**:
  - Use `fastify` for the HTTP server framework (fits our CommonJS TS build/runtime).
- **DRIVER MUST ANSWER BEFORE IMPLEMENTATION**:
  1. Port / listen behavior:
     - default `PORT=3000` (typical) unless driver prefers another
  2. Should `GET /api/health` require auth?
     - **Already decided**: **no** (unauthenticated)

## Implementation steps (ordered)

1. Pick the HTTP framework (per driver decision) and add deps to `packages/api/package.json`.
2. Implement a small server in `packages/api/src/main.ts`:
   - mount routes under `/api`
   - implement `GET /api/health` returning `{ ok: true }`
   - implement a shared error envelope:
     - `{ ok: false, error: { code, message } }`
3. Implement API key auth in `packages/api/src/auth/api_key.ts`:
   - read `ADMIN_API_KEY` (prefer using `loadRuntimeEnv`)
   - middleware checks `X-API-Key` header
   - return 401 JSON error on mismatch
4. Wire auth middleware onto all `/api/*` routes except (optionally) `/api/health`.
5. Ensure `pnpm -r build` produces `packages/api/dist/main.js` that can be executed.

## Acceptance criteria

- [ ] `pnpm -r typecheck` passes.
- [ ] `pnpm -r build` passes.
- [ ] `node packages/api/dist/main.js` starts an HTTP server.
- [ ] `GET /api/health` returns `{ "ok": true }`.
- [ ] Auth middleware rejects missing/wrong `X-API-Key` with a JSON error envelope.

## Test plan (copy/paste)

```bash
pnpm -r typecheck
pnpm -r build

# Optional manual smoke (set env vars appropriately):
# ADMIN_API_KEY=... DATABASE_URL=... REDIS_URL=... node packages/api/dist/main.js
```

## Commit

- **Message**: `feat(api): scaffold server + API key auth + health`
- **Files expected**:
  - `packages/api/package.json`
  - `packages/api/src/main.ts`
  - `packages/api/src/auth/api_key.ts`
  - (optional) `packages/api/src/routes/health.ts`

## Final step (required): print GPT‑5.2 review prompt

After committing, print this block **filled in**:

```text
REVIEW PROMPT (paste into GPT‑5.2 xtra high)

You are GPT‑5.2 xtra high acting as a senior reviewer/architect in this repo.
Please review my just-finished change for correctness, spec compliance, and unintended side effects.

Repo: /Users/lamosty/projects/aharadar
Branch: <branch-name>
Commit(s): <commit-hash(es)>

Task spec followed:
- docs/_session/tasks/task-028-api-scaffold.md
- docs/api.md

What I changed (1–3 bullets):
- ...

Files changed:
- ...

How to validate:
- pnpm -r typecheck
- pnpm -r build
- <manual curl commands if run>

What I’m unsure about / decisions I made:
- ...
```


