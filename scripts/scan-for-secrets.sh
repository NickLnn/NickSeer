#!/usr/bin/env bash
# scan-for-secrets.sh — a lightweight pre-push safety net.
# Run this from the repo root BEFORE every `git push`:
#   bash scripts/scan-for-secrets.sh
#
# It fails (exit 1) if it finds anything that looks like a live API key,
# Plex token, or a real (non-empty) settings.json about to be committed.
# This is a best-effort scanner, NOT a substitute for .gitignore — the config/
# folder should already be ignored. Think of this as a second seatbelt.

set -uo pipefail
FAIL=0
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "🔍 Scanning staged + tracked files for likely secrets…"

# 1) Make sure config/settings.json is never actually tracked by git.
if git ls-files --error-unmatch config/settings.json >/dev/null 2>&1; then
  echo "❌ config/settings.json is TRACKED BY GIT. Remove it: git rm --cached config/settings.json"
  FAIL=1
fi

# 2) Scan tracked + staged text files for key-shaped strings.
PATTERNS=(
  'X-Plex-Token=[A-Za-z0-9_-]{15,}'          # a real Plex token pasted somewhere
  '"apiKey"\s*:\s*"[A-Za-z0-9]{20,}"'        # a populated apiKey field
  '"token"\s*:\s*"[A-Za-z0-9_-]{15,}"'       # a populated token field
  'sk-[A-Za-z0-9]{20,}'                      # OpenAI-style secret key
  '"password"\s*:\s*"(?!\s*")[^"]{4,}"'      # a non-empty password field
)

FILES=$(git ls-files -- ':!:config/**' ':!:*.md')
HIT=0
for pat in "${PATTERNS[@]}"; do
  MATCHES=$(echo "$FILES" | xargs -I{} grep -lEn "$pat" "{}" 2>/dev/null || true)
  if [ -n "$MATCHES" ]; then
    echo "❌ Pattern matched: $pat"
    echo "$MATCHES" | sed 's/^/   in: /'
    HIT=1
  fi
done
[ "$HIT" -eq 1 ] && FAIL=1

if [ "$FAIL" -eq 0 ]; then
  echo "✅ No obvious secrets found. Safe to push."
  exit 0
else
  echo ""
  echo "🚫 STOP — fix the above before pushing. If a real key was ever committed,"
  echo "   also ROTATE that key (TMDB/OMDb/Plex/Radarr/Sonarr) even after removing it,"
  echo "   since it may already be in git history."
  exit 1
fi
