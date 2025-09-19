#!/bin/bash

# CapRover Webhook Deploy Script
# This uses CapRover's webhook feature for deployment

echo "🚀 Starting CapRover webhook deployment..."

# Configuration - Update these with your actual values
CAPROVER_APP="menuqr"
WEBHOOK_URL="https://captain.apps.dramanddraught.com/api/v2/user/apps/webhooks/triggerbuild"

# You need to get these from CapRover:
# 1. Go to your app in CapRover
# 2. Go to "Deployment" tab
# 3. Find "Deploy via Webhook"
# 4. Copy the token from there
WEBHOOK_TOKEN="YOUR_WEBHOOK_TOKEN_HERE"

# Check if token is set
if [ "$WEBHOOK_TOKEN" = "YOUR_WEBHOOK_TOKEN_HERE" ]; then
    echo "❌ Error: Please update WEBHOOK_TOKEN in this script"
    echo "Get it from CapRover > Your App > Deployment > Deploy via Webhook"
    exit 1
fi

# Commit any changes
echo "📝 Committing changes..."
git add -A
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "Deploy: $TIMESTAMP" || echo "No changes to commit"

# Push to GitHub (required for webhook deployment)
echo "📤 Pushing to GitHub..."
git push origin main

# Trigger deployment via webhook
echo "🔔 Triggering CapRover deployment..."
curl -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{
        \"appName\": \"$CAPROVER_APP\",
        \"token\": \"$WEBHOOK_TOKEN\"
    }"

echo ""
echo "✅ Webhook triggered!"
echo "📊 Check deployment status at: https://captain.apps.dramanddraught.com"
echo "🌐 App will be available at: https://${CAPROVER_APP}.apps.dramanddraught.com"