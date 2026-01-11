#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI not found. Install Docker Desktop (macOS) or another Docker runtime." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Cannot connect to the Docker daemon. Is Docker running?" >&2
  if [[ "${OSTYPE:-}" == darwin* ]]; then
    echo "" >&2
    echo "macOS:" >&2
    echo "  - Start Docker Desktop (Applications → Docker), or run: open -a Docker" >&2
    echo "  - Wait until it says “Docker Desktop is running”, then retry." >&2
  else
    echo "Start your Docker daemon and retry." >&2
  fi
  exit 1
fi

# Start infra only (app containers require --profile apps)
# This is safe even if someone runs bare 'docker compose up' - profiles protect us
docker compose up -d postgres redis prometheus grafana

echo ""
echo "Infrastructure started:"
echo "  - Postgres:   localhost:5432"
echo "  - Redis:      localhost:6379"
echo "  - Prometheus: localhost:9090"
echo "  - Grafana:    localhost:3002 (admin/admin)"
echo ""
echo "Run apps locally with: pnpm dev:stack"
echo "Or in Docker with:     docker compose --profile apps up -d"


