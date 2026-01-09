#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

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

# Kill by port
kill_port 3000 "web"
kill_port 3001 "api"
kill_port 3101 "queue-ui"
kill_port 9091 "worker"

# Kill any stale Next.js processes for this project
next_pids=$(pgrep -f "next.*aharadar" 2>/dev/null || true)
if [[ -n "$next_pids" ]]; then
  echo "Killing stale Next.js processes: $next_pids"
  echo "$next_pids" | xargs kill -9 2>/dev/null || true
fi

# Clean up Next.js lock file
lock_file="$PROJECT_ROOT/packages/web/.next/dev/lock"
if [[ -f "$lock_file" ]]; then
  echo "Removing stale Next.js lock file..."
  rm -f "$lock_file"
fi

echo "Done."
