#!/usr/bin/env bash
set -euo pipefail

docker compose up -d postgres redis

echo ""
echo "Services are starting:"
echo "- Postgres: localhost:5432"
echo "- Redis:    localhost:6379"
echo ""
echo "Next:"
echo "- Copy env: cp .env.example .env"
echo "- (Later) run migrations + start worker/api when implemented."


