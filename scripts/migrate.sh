#!/usr/bin/env bash
set -euo pipefail

# Migration runner with tracking
# - Only runs migrations not yet recorded in schema_migrations table
# - Records each migration after successful execution
# - Stops on first error (no partial state)

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

# Create schema_migrations table if not exists
docker compose exec -T postgres psql -U aharadar -d aharadar -v ON_ERROR_STOP=1 <<'EOF' >/dev/null
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
EOF

echo "Checking migrations..."

# Get list of already applied migrations
APPLIED=$(docker compose exec -T postgres psql -U aharadar -d aharadar -t -A -c "SELECT name FROM schema_migrations ORDER BY name;")

# Count for summary
TOTAL=0
SKIPPED=0
APPLIED_NOW=0

for f in "${MIGRATIONS_DIR}"/*.sql; do
  base="$(basename "$f")"
  TOTAL=$((TOTAL + 1))

  # Check if already applied
  if echo "$APPLIED" | grep -qx "$base"; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo " - Applying: ${base}"

  # Run migration with ON_ERROR_STOP
  if ! docker compose exec -T postgres psql -U aharadar -d aharadar -v ON_ERROR_STOP=1 -f "/migrations/${base}" >/dev/null 2>&1; then
    echo "ERROR: Migration ${base} failed!" >&2
    echo "Database is in unknown state. Please check manually." >&2
    exit 1
  fi

  # Record as applied
  docker compose exec -T postgres psql -U aharadar -d aharadar -c "INSERT INTO schema_migrations (name) VALUES ('${base}');" >/dev/null

  APPLIED_NOW=$((APPLIED_NOW + 1))
done

echo "Done. Total: ${TOTAL}, Skipped: ${SKIPPED}, Applied: ${APPLIED_NOW}"
