#!/usr/bin/env bash
set -euo pipefail

USE_GITLEAKS=1
STRICT_DIRTY=0

usage() {
  cat <<'EOF'
Usage: ./scripts/publish-oss-checklist.sh [options]

Options:
  --no-gitleaks    Skip gitleaks check even if gitleaks is installed
  --strict-dirty   Fail if the working tree has unstaged/staged/untracked changes
  -h, --help       Show this help

What this checks:
  1. Working tree cleanliness (warn or fail in strict mode)
  2. Forbidden tracked file paths (.env, keys, db files, logs, backups, test artifacts)
  3. Suspicious untracked file paths that are easy to accidentally add
  4. High-confidence secret patterns in tracked content
  5. Optional custom denylist markers from .oss-denylist.txt
  6. Optional gitleaks scan (if installed)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --no-gitleaks)
      USE_GITLEAKS=0
      shift
      ;;
    --strict-dirty)
      STRICT_DIRTY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but not found in PATH." >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" ]]; then
  echo "Not inside a git repository." >&2
  exit 1
fi

cd "$repo_root"

failures=0
warnings=0

ok() {
  printf '  [OK] %s\n' "$1"
}

warn() {
  printf '  [WARN] %s\n' "$1"
  warnings=$((warnings + 1))
}

fail() {
  printf '  [FAIL] %s\n' "$1"
  failures=$((failures + 1))
}

print_list() {
  local line
  while IFS= read -r line; do
    [[ -n "$line" ]] && printf '    - %s\n' "$line"
  done
}

is_forbidden_path() {
  local path="$1"

  case "$path" in
    .env|*/.env|.env.local|*/.env.local|.env.*|*/.env.*)
      case "$path" in
        *.env.example|*.env.sample|*.env.template)
          ;;
        *)
          return 0
          ;;
      esac
      ;;
  esac

  case "$path" in
    *.pem|*.key|*.p12|*.pfx|*.kdbx|*.db|*.db-shm|*.db-wal|*.sqlite|*.sqlite3)
      return 0
      ;;
  esac

  case "$path" in
    logs/*|*/logs/*|backups/*|*/backups/*|docker-data/*|*/docker-data/*|\
    .work-specific-backup/*|*/.work-specific-backup/*|playwright-report/*|\
    */playwright-report/*|test-results/*|*/test-results/*)
      return 0
      ;;
  esac

  return 1
}

echo "Running OSS publish checklist in: $repo_root"
echo

echo "[1/6] Checking repository cleanliness..."
dirty=0
if ! git diff --quiet; then
  dirty=1
fi
if ! git diff --cached --quiet; then
  dirty=1
fi
if [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  dirty=1
fi

if [[ "$dirty" -eq 1 ]]; then
  if [[ "$STRICT_DIRTY" -eq 1 ]]; then
    fail "Working tree is not clean."
  else
    warn "Working tree is not clean. This is okay, but review staged changes carefully."
  fi
else
  ok "Working tree is clean."
fi

echo "[2/6] Checking forbidden tracked file paths..."
declare -a tracked_hits=()
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  if is_forbidden_path "$path"; then
    tracked_hits+=("$path")
  fi
done < <(git ls-files)

if [[ ${#tracked_hits[@]} -gt 0 ]]; then
  fail "Forbidden tracked paths detected."
  printf '%s\n' "${tracked_hits[@]}" | print_list
else
  ok "No forbidden tracked paths."
fi

echo "[3/6] Checking suspicious untracked file paths..."
declare -a untracked_hits=()
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  if is_forbidden_path "$path"; then
    untracked_hits+=("$path")
  fi
done < <(git ls-files --others --exclude-standard)

if [[ ${#untracked_hits[@]} -gt 0 ]]; then
  fail "Suspicious untracked paths detected (easy to leak via git add .)."
  printf '%s\n' "${untracked_hits[@]}" | print_list
else
  ok "No suspicious untracked paths."
fi

echo "[4/6] Scanning tracked content for high-confidence secret patterns..."
secret_regex='((^|[^A-Za-z0-9_])(sk-proj-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|xai-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})([^A-Za-z0-9_]|$)|-----BEGIN (RSA|OPENSSH|EC|DSA|PGP )?PRIVATE KEY-----)'
secret_matches="$(git grep --cached -nI -E "$secret_regex" || true)"
safe_placeholder_regex='(sk-test|sk-example|sk-your|sk-placeholder|ghp_example|github_pat_example|xai-test|AKIAIOSFODNN7EXAMPLE)'
secret_matches_filtered="$(printf '%s\n' "$secret_matches" | grep -E -v "$safe_placeholder_regex" || true)"
if [[ -n "$secret_matches_filtered" ]]; then
  fail "Potential secrets found in tracked content."
  printf '%s\n' "$secret_matches_filtered" | sed -n '1,40p' | print_list
else
  ok "No high-confidence secret patterns found."
fi

echo "[5/6] Scanning custom denylist markers (.oss-denylist.txt)..."
denylist_file=".oss-denylist.txt"
if [[ -f "$denylist_file" ]]; then
  deny_hits=0
  while IFS= read -r marker || [[ -n "$marker" ]]; do
    marker="${marker#"${marker%%[![:space:]]*}"}"
    marker="${marker%"${marker##*[![:space:]]}"}"
    [[ -z "$marker" ]] && continue
    [[ "$marker" == \#* ]] && continue

    marker_matches="$(git grep --cached -nI -F -- "$marker" -- . ':(exclude).oss-denylist.txt' || true)"
    if [[ -n "$marker_matches" ]]; then
      if [[ "$deny_hits" -eq 0 ]]; then
        fail "Custom denylist marker hits found."
      fi
      deny_hits=1
      printf '%s\n' "$marker_matches" | sed -n '1,20p' | print_list
    fi
  done < "$denylist_file"

  if [[ "$deny_hits" -eq 0 ]]; then
    ok "No denylist marker hits found."
  fi
else
  warn "No .oss-denylist.txt file found (optional but recommended)."
fi

echo "[6/6] Running gitleaks (if available)..."
if [[ "$USE_GITLEAKS" -eq 0 ]]; then
  warn "Skipped gitleaks by flag (--no-gitleaks)."
else
  if command -v gitleaks >/dev/null 2>&1; then
    if gitleaks git --no-banner --redact "$repo_root" >/dev/null 2>&1; then
      ok "gitleaks passed."
    else
      fail "gitleaks reported potential leaks."
    fi
  else
    warn "gitleaks not installed. Install it for deeper leak detection."
  fi
fi

echo
if [[ "$failures" -gt 0 ]]; then
  echo "Checklist FAILED: $failures failure(s), $warnings warning(s)."
  exit 1
fi

echo "Checklist PASSED: 0 failures, $warnings warning(s)."
echo "Safe to proceed with public push/release."
