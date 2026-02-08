# Personal Server Setup (Docker Infra + User Systemd API/Worker)

This setup is recommended when using `claude-subscription` or `codex-subscription` on a personal server.

## Important Disclaimer

`claude-subscription` and `codex-subscription` are experimental and intended for personal/self-hosted use only.

Use at your own risk. For OSS/public/shared deployments, use API-key providers (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`) instead.

## Why

Subscription providers use local CLI login state (`claude login` / `codex login`).

- Digest triage runs in the worker process.
- Manual "paste to summarize" runs in the API process.

Both must run as the same OS user that performed the login.

If API/worker run in Docker (often as `root`), subscription auth may fail and return login/auth errors.

## Recommended split

1. Run infrastructure in Docker: Postgres + Redis (+ optional Grafana/Prometheus/API/Web/Queue UI).
2. Run `@aharadar/api` and `@aharadar/worker` as **user-level systemd services**.
3. Stop Docker API/worker to avoid duplicate processes.

## Setup

1. Build API + worker:
```bash
pnpm --filter @aharadar/api... build
pnpm --filter @aharadar/worker... build
```

2. Create private env files:
```bash
mkdir -p ~/.config/aharadar
install -m 600 .env ~/.config/aharadar/api.env
install -m 600 .env ~/.config/aharadar/worker.env
```

3. Install units:
```bash
mkdir -p ~/.config/systemd/user
cp infra/systemd/aharadar-api.service.example ~/.config/systemd/user/aharadar-api.service
cp infra/systemd/aharadar-worker.service.example ~/.config/systemd/user/aharadar-worker.service
chmod 600 ~/.config/systemd/user/aharadar-api.service
chmod 600 ~/.config/systemd/user/aharadar-worker.service
```

4. Start and enable:
```bash
systemctl --user daemon-reload
systemctl --user enable --now aharadar-api.service
systemctl --user enable --now aharadar-worker.service
```

5. Ensure user services survive reboot/logout:
```bash
loginctl enable-linger "$USER"
```

6. Stop Docker API + worker:
```bash
docker compose stop api worker
docker compose rm -f api worker
```

7. (Optional) Keep web in Docker, pointed at host API:
```bash
# .env
WEB_INTERNAL_API_URL=http://host.docker.internal:43801

# recreate web so rewrite target updates
docker compose up -d --build web
```

If you run web on host too (`pnpm start:prod:lan`), keep:
```bash
API_URL=http://localhost:43801
```

## Alternative: keep API in Docker (not recommended for subscription mode)

You can mount user Claude credentials into the API container, but this is fragile and easy to misconfigure.
For personal setups, user-level systemd API + worker is simpler and more reliable.

## Optional: API container probing host worker health

If you temporarily keep API in Docker and worker on host, set:

```bash
WORKER_HEALTH_URL=http://host.docker.internal:9091/health
```

Then recreate API container:

```bash
docker compose up -d api
```

## Optional: worker only on host

If you intentionally keep API in Docker and only move worker to host:
```bash
docker compose stop worker
docker compose rm -f worker
```

## Security

1. Never commit `.env`, `*.env`, PM2 dumps, or logs.
2. Keep env files outside repo (`~/.config/aharadar/*.env`).
3. Rotate keys if they were exposed in shell history/runtime dumps.
