#!/bin/zsh
set -e
REPO="$HOME/Library/Application Support/Claude/local-agent-mode-sessions/2ac46ffc-200a-4ed8-a58a-133f5ed438a5/f7188d5b-99bf-4100-a49e-c57bd72db035/local_4cfb652f-e662-4ea2-840e-b40fe22f55ac/outputs/renkko"
PATCH="/Users/aurelien/Documents/Codex/2026-06-17/renkko-website-code/outputs/filmeai-latest-patch"
cd "$REPO"
rsync -av "$PATCH/" ./
rm -f .git/HEAD.lock .git/index.lock .git/refs/remotes/origin/main.lock 2>/dev/null || true
git status --short
