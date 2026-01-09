#!/usr/bin/env bash
set -euo pipefail

echo "Starting monitoring stack (Prometheus + Grafana)..."
docker compose up -d prometheus grafana

echo ""
echo "Monitoring stack started:"
echo "  - Prometheus: http://localhost:9090"
echo "  - Grafana:    http://localhost:3002 (admin/admin)"
echo ""
echo "Stop with: pnpm monitoring:stop"
