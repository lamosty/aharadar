# Personal Server Setup (Docker Infra + User Systemd Worker)

This setup is recommended when using `claude-subscription` on a personal server.

## Why

`claude-subscription` uses local Claude login state. The worker must run as the same OS user that ran `claude login`.

If worker runs in Docker (often as `root`), subscription auth may fail and return login/auth errors.

## Recommended split

1. Run infrastructure in Docker: Postgres + Redis (+ optional Grafana/Prometheus/API/Web/Queue UI).
2. Run `@aharadar/worker` as a **user-level systemd service**.
3. Stop Docker worker to avoid duplicate job processing.

## Setup

1. Build worker:
```bash
pnpm --filter @aharadar/worker... build
```

2. Create private env file:
```bash
mkdir -p ~/.config/aharadar
install -m 600 .env ~/.config/aharadar/worker.env
```

3. Install unit:
```bash
mkdir -p ~/.config/systemd/user
cp infra/systemd/aharadar-worker.service.example ~/.config/systemd/user/aharadar-worker.service
chmod 600 ~/.config/systemd/user/aharadar-worker.service
```

4. Start and enable:
```bash
systemctl --user daemon-reload
systemctl --user enable --now aharadar-worker.service
```

5. Ensure user services survive reboot/logout:
```bash
loginctl enable-linger "$USER"
```

6. Stop Docker worker:
```bash
docker compose stop worker
docker compose rm -f worker
```

## Optional: API container probing host worker health

When API stays in Docker and worker runs on host, set:

```bash
WORKER_HEALTH_URL=http://host.docker.internal:9091/health
```

Then recreate API container:

```bash
docker compose up -d api
```

## Security

1. Never commit `.env`, `*.env`, PM2 dumps, or logs.
2. Keep env files outside repo (`~/.config/aharadar/*.env`).
3. Rotate keys if they were exposed in shell history/runtime dumps.
