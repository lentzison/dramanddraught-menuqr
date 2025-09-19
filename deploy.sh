#!/bin/bash

# CapRover deployment script
echo "🚀 Deploying to CapRover..."

# Add all changes
git add -A

# Commit with timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "Deploy: $TIMESTAMP" || echo "No changes to commit"

# Deploy with default settings
caprover deploy --default

echo "✅ Deployment complete!"