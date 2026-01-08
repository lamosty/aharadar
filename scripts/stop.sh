#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Stopping everything..."
echo ""

"$SCRIPT_DIR/stop-apps.sh"
echo ""
"$SCRIPT_DIR/stop-services.sh"

echo ""
echo "All stopped."
