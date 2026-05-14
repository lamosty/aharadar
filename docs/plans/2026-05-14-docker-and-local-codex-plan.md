# Aha Radar Docker + Local Codex Plan

**Date:** 2026-05-14
**Status:** Planning handoff
**Audience:** future maintainers / AI coding agents
**Public-safety note:** this document is written for the public Aha Radar repository. Do not add private hostnames, personal filesystem paths, private service names, tokens, or deployment-specific secrets here.

## 1. Goal

Make Aha Radar boring to run as a self-hosted Docker application while keeping local Codex subscription usage optional and user-owned.

Target shape:

```text
Docker Compose runtime:
  postgres
  redis
  api
  web
  worker
  queue-ui (optional)
  migrate (one-shot)

Optional local Codex runtime:
  runs as the logged-in OS user
  uses that user's own Codex/ChatGPT login state
  is not required for normal Docker/API-key deployments
```

The default open-source path should use API-key providers. Subscription-backed Codex mode is a personal/self-hosted option only.

## 2. Current facts to preserve

- Aha Radar already has a Dockerfile with `api`, `web`, `worker`, and `queue-ui` targets.
- `docker-compose.yml` already has Postgres, Redis, observability services, and app services behind the `apps` profile.
- The existing `codex-subscription` provider uses `@openai/codex-sdk`.
- The Codex SDK path is already wired through the normal LLM router and admin settings.
- The direct Codex SDK smoke script exists:

```bash
pnpm exec tsx scripts/test-codex-subscription.ts --help
```

Do not replace the working SDK path with a larger app-server architecture unless a concrete need appears.

## 3. Non-goals

Do **not** do these as part of this plan:

1. Do not add a dependency on any private orchestration platform.
2. Do not require private DNS, private service names, or private deployment tools.
3. Do not make subscription auth the default path for public users.
4. Do not share one person's subscription login across other users.
5. Do not mount personal auth directories into app containers as the default documented deployment.
6. Do not rewrite the LLM stack around Codex app-server unless SDK mode fails or a product requirement needs durable interactive agent sessions.

## 4. Provider policy

Public/default providers:

- `openai` via `OPENAI_API_KEY`
- `anthropic` via `ANTHROPIC_API_KEY`

Personal/self-hosted providers:

- `codex-subscription` using `@openai/codex-sdk` and the local user's own Codex login
- legacy `claude-subscription` may remain documented as experimental only if it is still supported and legally acceptable for personal use

Recommended public docs wording:

> Subscription providers are for personal/self-hosted use by the account owner. For hosted, shared, team, or public deployments, use API-key providers.

## 5. Architecture decision

### 5.1 Keep the app in Docker

The long-term app runtime should be Docker Compose:

```text
web      -> Next.js UI
api      -> Fastify API
worker   -> scheduler and pipeline worker
postgres -> pgvector database
redis    -> queues/quota/cache
```

Why:

- one reproducible runtime for local server and production-like use;
- no dependency on host `pnpm`, shell, or user systemd for the app;
- simpler restart/health/log story;
- safer open-source onboarding.

### 5.2 Keep Codex subscription local to the logged-in user

Codex subscription credentials are user-scoped. Do not treat them like a normal server secret.

Use one of two modes:

#### Mode A — direct SDK mode, current behavior

Aha Radar process calls `@openai/codex-sdk` directly.

Good for:

- local development;
- running API/worker directly as the logged-in user;
- smoke testing the provider.

Limitation:

- Docker API/worker containers usually do not have the user's Codex login state.

#### Mode B — local Codex bridge, optional future improvement

If fully Dockerized API/worker must use a personal Codex subscription, add a tiny host-side bridge:

```text
api/worker container
  -> localhost or Unix socket
    -> aharadar-codex-host running as the logged-in user
      -> @openai/codex-sdk
```

This keeps app containers Dockerized while keeping subscription auth in the user's session.

Only implement this if there is a real need to use subscription mode from Docker. API-key mode does not need it.

## 6. Phase plan

### Phase 0 — Safety and baseline

Before editing:

```bash
git status --short --branch
git log --oneline -5
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm oss:check
```

If tests fail, identify whether failures are pre-existing before changing code.

Safety rules:

- Never print `.env` contents.
- Never commit `.env`, local logs, local DB dumps, auth files, screenshots with private data, or generated secrets.
- Keep docs generic: no private hostnames, no personal home paths, no private deployment commands.
- Stage specific files only.

### Phase 1 — Make Docker Compose app runtime first-class

Goal: `docker compose --profile apps up -d --build` is a supported deployment path, not a secondary path.

Tasks:

1. Add or verify `.dockerignore` excludes at least:
   - `.git`
   - `.env*` except safe examples if deliberately copied
   - `node_modules`
   - package `dist` outputs if images build them from source
   - `.next`
   - coverage, logs, local backups, dumps
2. Add a `migrate` one-shot service to `docker-compose.yml`.
   - It should run all pending SQL migrations exactly once.
   - Prefer a repo-owned migration runner over shelling through host Docker scripts.
   - It should fail loudly on migration errors.
3. Make `api` and `worker` depend on healthy Postgres/Redis and successful migrations where Compose supports it.
4. Add healthchecks for:
   - `api`
   - `web`
   - `worker` metrics/health endpoint if available
5. Add package scripts such as:

```json
{
  "docker:up": "docker compose --profile apps up -d --build",
  "docker:down": "docker compose --profile apps down",
  "docker:logs": "docker compose --profile apps logs -f",
  "docker:migrate": "docker compose run --rm migrate"
}
```

6. Verify with a clean-ish path:

```bash
cp .env.example .env
pnpm docker:up
pnpm docker:migrate
curl -fsS http://127.0.0.1:${API_PORT:-3001}/api/health
curl -fsS http://127.0.0.1:${WEB_PORT:-3000}/
```

Acceptance:

- Docker app services start after a reboot/recreate.
- Migrations are repeatable/idempotent.
- API and web health checks pass.
- No subscription provider is required for the Docker smoke path.

### Phase 2 — Documentation refresh

Goal: make the open-source instructions match the recommended runtime.

Tasks:

1. Update `README.md` so Docker Compose is the canonical server/deployment path.
2. Keep local `pnpm start` documented as development mode.
3. Rewrite or archive `docs/personal-server-systemd.md`.
   - The old recommendation to run API/worker under user systemd should not remain the main subscription story.
   - If kept, label it legacy/manual.
4. Add `docs/local-codex.md` for personal Codex mode.

`docs/local-codex.md` should explain:

- API-key providers are preferred for hosted/shared deployments.
- Codex subscription mode uses the user's own local login.
- Direct SDK mode works when the process runs as that user.
- Dockerized API/worker need either API keys or an optional local Codex bridge.
- Do not commit or share Codex auth state.

Acceptance:

- A new public reader can understand Docker setup without knowing any private deployment context.
- Subscription mode is clearly optional and personal-only.

### Phase 3 — Keep existing Codex SDK provider healthy

Goal: preserve the working provider and avoid unnecessary architecture churn.

Tasks:

1. Keep `packages/llm/src/codex_subscription.ts` as the SDK-backed provider.
2. Keep model resolution and reasoning effort support aligned with router settings.
3. Keep a direct smoke script:

```bash
pnpm exec tsx scripts/test-codex-subscription.ts --model <model> --reasoning low --count 1
```

4. Ensure provider failures are explicit:
   - auth missing;
   - model unsupported by installed Codex version;
   - quota exhausted;
   - empty response.
5. Avoid falling back from subscription mode to API-key mode silently.

Acceptance:

- Direct SDK smoke passes on a machine where `codex` is logged in.
- Direct SDK smoke fails clearly when auth/model/tooling is missing.
- API-key provider remains unaffected.

### Phase 4 — Optional local Codex bridge

Only do this if Dockerized API/worker must use personal Codex subscription mode.

Proposed package:

```text
packages/codex-host/
  src/main.ts
  package.json
  README.md
```

Minimal API:

```http
GET /healthz
POST /v1/llm
```

Request shape should mirror Aha Radar's generic LLM request, not expose Codex internals:

```json
{
  "model": "gpt-5.5",
  "reasoningEffort": "low",
  "system": "...",
  "user": "...",
  "metadata": {
    "task": "triage"
  }
}
```

Response shape:

```json
{
  "ok": true,
  "outputText": "...",
  "provider": "codex-subscription"
}
```

Security constraints:

- Bind to `127.0.0.1` by default, or a Unix socket.
- Do not expose externally.
- Do not log prompts by default.
- Do not log secrets or auth state.
- Add an optional shared token only for local container-to-host use, never as a public internet auth mechanism.

Then add a container-callable provider in `packages/llm`, for example:

```text
codex-local
```

Possible env:

```bash
LLM_PROVIDER=codex-local
CODEX_LOCAL_URL=http://host.docker.internal:43117/v1/llm
CODEX_MODEL=gpt-5.5
CODEX_CALLS_PER_HOUR=50
```

Acceptance:

- Host bridge works with local Codex login.
- Docker API/worker can call the bridge without seeing Codex auth files.
- Bridge is optional and disabled by default.

### Phase 5 — Remove stale coupling and dead docs

Tasks:

1. Search for private or misleading references before public release:

```bash
git grep -nE 'private|internal|/home/|TOKEN|SECRET|PASSWORD|API_KEY|your-private-domain|example\.internal' -- ':!**/node_modules/**'
```

Classify findings. Do not blindly delete valid generic security docs.

2. Ensure public docs never require a private stack.
3. Ensure examples use `.env.example` and placeholders only.
4. Ensure subscription providers are labeled personal/self-hosted only.

Acceptance:

- No private deployment knowledge is required to run Aha Radar.
- No private hostnames or personal filesystem paths are introduced.
- OSS check passes.

## 7. Recommended immediate implementation order

For the next agent:

1. Do **Phase 0** baseline.
2. Do **Phase 1** Docker runtime hardening.
3. Do **Phase 2** docs refresh.
4. Re-run:

```bash
pnpm typecheck
pnpm build
pnpm oss:check
```

5. Run Docker smoke if Docker access is available:

```bash
pnpm docker:up
pnpm docker:migrate
curl -fsS http://127.0.0.1:${API_PORT:-3001}/api/health
```

6. Only start **Phase 4** if the user explicitly wants subscription mode from Docker immediately.

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Accidental secret/public personal detail in OSS docs | Keep docs generic; never paste env values; review with `git grep`. |
| Docker app works but migrations are manual | Add one-shot migrate service and documented scripts. |
| Subscription mode fails inside Docker | Keep API-key as default; add optional local Codex bridge only if needed. |
| Overbuilding around Codex app-server | Keep SDK path unless a durable interactive session requirement appears. |
| Tests have pre-existing failures | Record baseline before edits; do not mix test repair with Docker/runtime work unless requested. |
| Public users misunderstand subscription mode | Use clear personal-only wording in README/docs. |

## 9. Definition of done

Minimum done:

- Docker Compose app runtime is documented and works.
- Migrations have a Docker-native path.
- Existing Codex SDK provider is preserved.
- README and docs are public-safe.
- `pnpm typecheck`, `pnpm build`, and `pnpm oss:check` pass.

Stretch done:

- Optional `codex-local` host bridge exists.
- Dockerized API/worker can use local Codex subscription without mounting user auth into containers.
- Direct SDK and bridge modes both have smoke tests.
