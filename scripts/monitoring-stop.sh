#!/usr/bin/env bash
set -euo pipefail

echo "Stopping monitoring stack..."
docker compose stop prometheus grafana
echo "Monitoring stack stopped."
