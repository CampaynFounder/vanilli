#!/usr/bin/env bash
# Smoke test for process_video Modal web endpoint.
# Usage: ./modal_app/smoke_test.sh [URL]
#   URL = the process_video endpoint (e.g. from `modal serve` or `modal deploy`).
#   If omitted, uses MODAL_PROCESS_VIDEO_URL or MODAL_URL from the environment.

set -e

URL="${1:-${MODAL_PROCESS_VIDEO_URL:-${MODAL_URL}}}"
if [ -z "$URL" ]; then
  echo "Usage: $0 <process_video URL>"
  echo "  Or set MODAL_PROCESS_VIDEO_URL or MODAL_URL"
  echo "  Get the URL from: modal serve modal_app/process_video.py"
  exit 1
fi

echo "Smoke test: POST $URL"
RES=$(curl -s -w "\n%{http_code}" -X POST "$URL" -H "Content-Type: application/json" -d '{}')
HTTP=$(echo "$RES" | tail -n1)
BODY=$(echo "$RES" | sed '$d')

echo "HTTP: $HTTP"
echo "Body: $BODY"

if [ "$HTTP" = "200" ] && echo "$BODY" | grep -q '"ok"' && echo "$BODY" | grep -q 'Missing required fields'; then
  echo "OK: endpoint is up and returned expected validation error."
  exit 0
fi

echo "Unexpected response."
exit 1
