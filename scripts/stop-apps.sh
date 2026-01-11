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
    # Filter out Docker processes - killing com.docker.backend crashes Docker Desktop
    local safe_pids=""
    for pid in $pids; do
      local cmd
      cmd=$(ps -p "$pid" -o comm= 2>/dev/null || true)
      if [[ "$cmd" == *docker* || "$cmd" == *Docker* || "$cmd" == com.docker* ]]; then
        echo "Skipping Docker process on port $port (PID: $pid, $cmd) - use 'docker compose stop' instead."
      else
        safe_pids="$safe_pids $pid"
      fi
    done
    if [[ -n "$safe_pids" ]]; then
      echo "Killing $name on port $port (PIDs:$safe_pids)..."
      echo "$safe_pids" | xargs kill -9 2>/dev/null || true
    else
      echo "No non-Docker process on port $port ($name)."
    fi
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
