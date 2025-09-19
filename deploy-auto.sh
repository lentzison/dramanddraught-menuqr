#!/bin/bash

# CapRover Auto-Deploy Script
# This script handles non-interactive deployment to CapRover

echo "🚀 Starting automated CapRover deployment..."

# Configuration
CAPROVER_URL="https://captain.apps.dramanddraught.com"
CAPROVER_APP="menuqr"
CAPROVER_BRANCH="main"

# Check if we're on the right branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$CAPROVER_BRANCH" ]; then
    echo "⚠️ Warning: Not on $CAPROVER_BRANCH branch (currently on $CURRENT_BRANCH)"
    echo "Switching to $CAPROVER_BRANCH..."
    git checkout $CAPROVER_BRANCH
fi

# Commit any changes
echo "📝 Checking for uncommitted changes..."
if [ -n "$(git status --porcelain)" ]; then
    echo "Found changes, committing..."
    git add -A
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    git commit -m "Auto-deploy: $TIMESTAMP"
else
    echo "No uncommitted changes found"
fi

# Get the latest commit hash
COMMIT_HASH=$(git rev-parse HEAD)
echo "📦 Deploying commit: $COMMIT_HASH"

# Create tar file
TAR_FILE="deploy-package.tar"
echo "📦 Creating deployment package..."

# Create the tar file with git archive (respects .gitignore)
git archive --format=tar --output=$TAR_FILE HEAD

# Deploy using caprover CLI with all flags to avoid prompts
echo "🚢 Deploying to CapRover..."

# Try to deploy with the saved configuration
npx caprover deploy \
    --tarFile $TAR_FILE \
    --appName $CAPROVER_APP \
    --default \
    2>&1 | while IFS= read -r line; do
    echo "$line"
    if [[ "$line" == *"Deploy failed"* ]]; then
        echo "❌ Deployment failed. Please check your CapRover settings."
        rm -f $TAR_FILE
        exit 1
    fi
    if [[ "$line" == *"Deployed successfully"* ]]; then
        echo "✅ Deployment successful!"
    fi
done

# Clean up
echo "🧹 Cleaning up..."
rm -f $TAR_FILE

echo "✨ Deployment process complete!"
echo "🌐 Your app should be available at: https://${CAPROVER_APP}.apps.dramanddraught.com"
echo ""
echo "📝 Notes:"
echo "- Check CapRover logs if the app isn't working"
echo "- The database migrations will run automatically on startup"
echo "- First deployment may take a few minutes to set up the database"