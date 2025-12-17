#!/usr/bin/env bash
set -euo pipefail

echo "This will delete local docker volumes for Postgres/Redis."
echo "All local data will be lost."

docker compose down -v
docker compose up -d postgres redis

./scripts/migrate.sh

echo "Reset complete."


