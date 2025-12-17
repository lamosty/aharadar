#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI not found. Install Docker Desktop (macOS) or another Docker runtime." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Cannot connect to the Docker daemon. Start Docker and retry." >&2
  exit 1
fi

echo "This will delete local docker volumes for Postgres/Redis."
echo "All local data will be lost."

docker compose down -v
docker compose up -d postgres redis

./scripts/migrate.sh

echo "Reset complete."


