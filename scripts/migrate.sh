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

docker compose up -d postgres

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/packages/db/migrations"

echo "Waiting for Postgres..."
until docker compose exec -T postgres pg_isready -U aharadar -d aharadar >/dev/null 2>&1; do
  sleep 0.5
done

echo "Applying SQL migrations (naive runner; re-runnable DDL)..."

for f in "${MIGRATIONS_DIR}"/*.sql; do
  base="$(basename "$f")"
  echo " - ${base}"
  docker compose exec -T postgres psql -U aharadar -d aharadar -v ON_ERROR_STOP=1 -f "/migrations/${base}" >/dev/null
done

echo "Done."


