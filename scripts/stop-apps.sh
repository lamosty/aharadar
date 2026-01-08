#!/usr/bin/env bash
set -euo pipefail

echo "Stopping app processes..."

kill_port() {
  local port=$1
  local name=$2
  local pids
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "Killing $name on port $port (PIDs: $pids)..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
  else
    echo "No process on port $port ($name)."
  fi
}

kill_port 3000 "web"
kill_port 3001 "api"

echo "Done."
