#!/bin/bash

# CapRover Auto-Deploy Script
echo "🚀 Starting automated CapRover deployment..."

# Commit any changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Committing changes..."
    git add -A
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    git commit -m "Auto-deploy: $TIMESTAMP"
else
    echo "No uncommitted changes"
fi

# Deploy using caprover with the default saved configuration
echo "🚢 Deploying to CapRover..."
echo "" | caprover deploy --default

echo "✅ Deployment triggered!"
echo "🌐 Your app should be available at: https://menuqr.apps.dramanddraught.com"