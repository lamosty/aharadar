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

## Docker plus local login state

Dockerized API/worker containers usually do not have access to the logged-in user's Codex auth state. That is intentional: auth files are personal and should not be mounted into containers by default.

If you need Dockerized API/worker plus personal Codex subscription mode, run the local host bridge:

```text
api/worker container
  -> localhost or Unix socket
    -> aharadar-codex-host running as the logged-in OS user
      -> @openai/codex-sdk
```

The bridge keeps the public provider value as `codex-subscription`; it only changes where the SDK call executes.

### 1. Start the host bridge as your OS user

```bash
pnpm install --frozen-lockfile
bun run --cwd packages/codex-host build
bun run codex-host
```

Useful host-side env:

```bash
CODEX_HOST_BIND=127.0.0.1
CODEX_HOST_PORT=43117
CODEX_LOCAL_TOKEN=<random-local-token>
CODEX_HOST_WORKDIR=/tmp/aharadar-codex-host
CODEX_MODEL=gpt-5.5
```

On Linux Docker hosts, containers may not be able to reach a service bound only to `127.0.0.1` through `host.docker.internal`. If needed, bind the bridge to a host-only interface or `0.0.0.0`, keep firewall rules tight, and always use `CODEX_LOCAL_TOKEN`.

The bridge runs Codex as a constrained LLM provider: no prompt logging, `approvalPolicy=never`, `sandboxMode=read-only`, web/network tools disabled, and a dedicated working directory by default.

Health check:

```bash
curl -fsS http://127.0.0.1:43117/healthz
```

### Optional: run the host bridge with user systemd

The repo includes a user-service example for keeping the bridge alive across reboots:

```bash
mkdir -p ~/.config/aharadar ~/.config/systemd/user
install -m 600 .env ~/.config/aharadar/codex-host.env
cp infra/systemd/aharadar-codex-host.service.example ~/.config/systemd/user/aharadar-codex-host.service
systemctl --user daemon-reload
systemctl --user enable --now aharadar-codex-host.service
```

Make sure `~/.config/aharadar/codex-host.env` contains the same `CODEX_LOCAL_TOKEN` that Docker uses.

### 2. Point Docker API/worker at the host bridge

In `.env` used by Docker Compose:

```bash
CODEX_USE_SUBSCRIPTION=true
CODEX_LOCAL_URL=http://host.docker.internal:43117/v1/llm
CODEX_LOCAL_TOKEN=<same-random-local-token>
CODEX_MODEL=gpt-5.5
CODEX_CALLS_PER_HOUR=50
```

Then start/recreate the Docker stack:

```bash
docker compose --profile apps up -d --build
```

In the app, choose **Codex Subscription** in Admin → LLM settings. The API/worker containers will call `CODEX_LOCAL_URL`; the host bridge will call `@openai/codex-sdk` as your logged-in user.

## Safety rules

- Do not commit Codex auth state, `.env`, logs, or screenshots containing account data.
- Do not share subscription mode in hosted/team/public deployments.
- Do not silently fall back from subscription mode to API-key mode; provider failures should be explicit.
- Keep API-key providers as the default Docker path.
- Do not expose the host bridge to the public internet.
