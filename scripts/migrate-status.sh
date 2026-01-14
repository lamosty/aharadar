#!/usr/bin/env bash
set -euo pipefail

# Show migration status - which are applied vs pending

if ! docker compose exec -T postgres pg_isready -U aharadar -d aharadar >/dev/null 2>&1; then
  echo "Postgres is not running. Start with: pnpm dev:services" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/packages/db/migrations"

# Get applied migrations
APPLIED=$(docker compose exec -T postgres psql -U aharadar -d aharadar -t -A -c "SELECT name FROM schema_migrations ORDER BY name;" 2>/dev/null || echo "")

echo "Migration Status"
echo "================"
echo ""

PENDING=0
for f in "${MIGRATIONS_DIR}"/*.sql; do
  base="$(basename "$f")"
  if echo "$APPLIED" | grep -qx "$base"; then
    echo "✓ ${base}"
  else
    echo "○ ${base} (pending)"
    PENDING=$((PENDING + 1))
  fi
done

echo ""
if [ "$PENDING" -eq 0 ]; then
  echo "All migrations applied."
else
  echo "${PENDING} migration(s) pending. Run: pnpm migrate"
fi
