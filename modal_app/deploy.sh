#!/usr/bin/env bash
# Deploy process_video to Modal (production).
# Usage: ./modal_app/deploy.sh
#   From repo root, or from any directory (script finds repo root).
# Prerequisites: Modal CLI (modal setup), vannilli-secrets: SUPABASE_*; and KLING_ACCESS_KEY+KLING_SECRET_KEY, or KLING_API_KEY.

set -e

# Repo root: directory containing modal_app/process_video.py
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_PY="$REPO_ROOT/modal_app/process_video.py"

if [ ! -f "$APP_PY" ]; then
  echo "Error: $APP_PY not found."
  exit 1
fi

MODAL_CMD=""
if command -v modal >/dev/null 2>&1; then
  MODAL_CMD="modal"
elif python3 -m modal --help >/dev/null 2>&1; then
  MODAL_CMD="python3 -m modal"
elif python -m modal --help >/dev/null 2>&1; then
  MODAL_CMD="python -m modal"
fi

if [ -z "$MODAL_CMD" ]; then
  echo "Error: Modal CLI not found."
  echo ""
  echo "Install:"
  echo "  pip install modal"
  echo "  # or: uv pip install modal"
  echo ""
  echo "Then authenticate:"
  echo "  modal setup"
  echo "  # or: python3 -m modal setup"
  echo ""
  echo "Docs: https://modal.com/docs/guide/install"
  exit 1
fi

echo "Deploying process_video to Modal..."
echo "  app: $APP_PY"
echo ""

cd "$REPO_ROOT"
$MODAL_CMD deploy modal_app/process_video.py

echo ""
echo "Done. Use the deployed URL (no -dev) in NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL for production."
echo "Smoke test: ./modal_app/smoke_test.sh <deployed-url>"
