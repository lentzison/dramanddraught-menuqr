#!/usr/bin/env bash

# Fully non-interactive CapRover deployment using App Token
# Usage:
#   CAPROVER_APP_TOKEN=xxxx npm run deploy:ci
# Optional overrides:
#   CAPROVER_URL, CAPROVER_APP, TAR_FILE

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Defaults (override via env)
CAPROVER_URL="${CAPROVER_URL:-https://captain.apps.dramanddraught.com}"
CAPROVER_APP="${CAPROVER_APP:-menuqr}"
CAPROVER_APP_TOKEN="${CAPROVER_APP_TOKEN:-}"
TAR_FILE="${TAR_FILE:-deploy.tar}"

echo -e "${GREEN}=== CapRover Deploy (non-interactive) ===${NC}"

if [[ -z "$CAPROVER_APP_TOKEN" ]]; then
  echo -e "${RED}Error:${NC} CAPROVER_APP_TOKEN is not set."
  echo "Create an App Token in CapRover → Your App → Deployment → App Token,"
  echo "then export it: export CAPROVER_APP_TOKEN=..."
  exit 1
fi

echo -e "${YELLOW}Packaging source (working tree) into tar...${NC}"
rm -f "$TAR_FILE"
tar --exclude='.git' \
    --exclude='node_modules' \
    --exclude='*.tar' \
    --exclude='*.tar.gz' \
    --exclude='.env*' \
    --exclude='tmp' \
    --exclude='temp' \
    -cf "$TAR_FILE" .

echo -e "${YELLOW}Deploying to:${NC} $CAPROVER_URL (app: $CAPROVER_APP)"
caprover deploy \
  --caproverUrl "$CAPROVER_URL" \
  --appName "$CAPROVER_APP" \
  --tarFile "./$TAR_FILE" \
  --appToken "$CAPROVER_APP_TOKEN"

echo -e "${GREEN}Deployment triggered successfully.${NC}"

# Determine app URL for readiness check
if [[ -n "${CAPROVER_APP_URL:-}" ]]; then
  APP_URL="$CAPROVER_APP_URL"
else
  host="${CAPROVER_URL#*://}"
  # Strip trailing slashes
  host="${host%%/}"
  # Remove leading captain. if present
  rootDom="$host"
  if [[ "$rootDom" == captain.* ]]; then
    rootDom="${rootDom#captain.}"
  fi
  APP_URL="https://${CAPROVER_APP}.${rootDom}"
fi

echo -e "${YELLOW}Waiting for app to become healthy at:${NC} $APP_URL"

# Poll for readiness up to ~5 minutes
for i in {1..30}; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL" || echo 000)
  ts=$(date '+%H:%M:%S')
  echo "[$ts] Attempt $i: HTTP $code"
  if [[ "$code" == "200" ]]; then
    echo -e "${GREEN}App is healthy at $APP_URL${NC}"
    exit 0
  fi
  sleep 10
done

echo -e "${RED}Timed out waiting for healthy response from $APP_URL${NC}"
exit 1
