#!/usr/bin/env bash
set -euo pipefail

echo "Stopping Docker services..."

# Stop all containers including those from --profile apps
# Using --profile apps ensures we stop app containers even if they were started separately
if docker compose --profile apps ps --quiet 2>/dev/null | grep -q .; then
  docker compose --profile apps stop
  echo "Docker services stopped."
else
  echo "No Docker services running."
fi
