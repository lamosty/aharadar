# Local Codex Subscription Mode

`codex-subscription` is an optional personal/self-hosted provider mode. It uses the existing `@openai/codex-sdk` provider path in Aha Radar.

For hosted, shared, team, or public deployments, use API-key providers instead:

- `openai` with `OPENAI_API_KEY`
- `anthropic` with `ANTHROPIC_API_KEY`

Do not make one person's subscription login available to other users.

## Recommended default: API keys in Docker

The default self-hosted runtime is Docker Compose:

```bash
cp .env.example .env
# edit .env and set OPENAI_API_KEY or ANTHROPIC_API_KEY
docker compose --profile apps up -d --build
```

This path does not need local Codex login state.

## Direct SDK mode

Direct SDK mode means the API/worker process calls `@openai/codex-sdk` directly.

Use it only when:

1. the machine is yours;
2. you are the account owner;
3. the Aha Radar process runs as the same OS user that performed the Codex login.

Typical local smoke test:

```bash
pnpm exec tsx scripts/test-codex-subscription.ts --help
```

Then configure `.env` for personal use:

```bash
LLM_PROVIDER=codex-subscription
CODEX_USE_SUBSCRIPTION=true
CODEX_MODEL=
CODEX_TRIAGE_MODEL=
CODEX_CALLS_PER_HOUR=50
```

Keep `.env` local and uncommitted.

## Docker and local login state

Dockerized API/worker containers usually do not have access to the logged-in user's Codex auth state. That is intentional: auth files are personal and should not be mounted into containers by default.

If you need Dockerized API/worker plus personal Codex subscription mode, prefer adding a tiny host-side bridge later:

```text
api/worker container
  -> localhost or Unix socket
    -> aharadar-codex-host running as the logged-in OS user
      -> @openai/codex-sdk
```

The bridge should bind locally only, avoid prompt logging by default, and keep subscription auth in the user's session.

## Safety rules

- Do not commit Codex auth state, `.env`, logs, or screenshots containing account data.
- Do not share subscription mode in hosted/team/public deployments.
- Do not silently fall back from subscription mode to API-key mode; provider failures should be explicit.
- Keep API-key providers as the default Docker path.
