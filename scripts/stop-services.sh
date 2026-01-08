#!/usr/bin/env bash
set -euo pipefail

echo "Stopping Docker services..."

if docker compose ps --quiet 2>/dev/null | grep -q .; then
  docker compose stop
  echo "Docker services stopped."
else
  echo "No Docker services running."
fi
