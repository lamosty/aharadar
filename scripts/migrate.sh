#!/usr/bin/env bash
set -euo pipefail

docker compose up -d postgres

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/packages/db/migrations"

echo "Applying SQL migrations (naive runner; re-runnable DDL)..."

for f in "${MIGRATIONS_DIR}"/*.sql; do
  base="$(basename "$f")"
  echo " - ${base}"
  docker compose exec -T postgres psql -U aharadar -d aharadar -v ON_ERROR_STOP=1 -f "/migrations/${base}" >/dev/null
done

echo "Done."


