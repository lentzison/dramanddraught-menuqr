#!/bin/bash

echo "🚀 Starting CapRover deployment..."

# Ensure we're in the right directory
cd /Users/lentz/Documents/Development/Web/menuqr

# Commit any changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Committing changes..."
    git add -A
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    git commit -m "Deploy: $TIMESTAMP"
else
    echo "✅ No changes to commit"
fi

# Get the current commit hash
COMMIT_HASH=$(git rev-parse HEAD)
echo "📦 Deploying commit: ${COMMIT_HASH:0:7}"

# Create the tar file that CapRover expects
echo "📦 Creating deployment package..."
rm -f deploy.tar 2>/dev/null
git archive --format=tar --output=deploy.tar HEAD

# Method 1: Try with yes command to auto-answer prompts
echo "🚢 Attempting deployment..."
yes | head -2 | (echo "main" && echo "y") | caprover deploy -n captain-01 -a menuqr 2>&1 | while IFS= read -r line; do
    echo "$line"
    # Check if deployment started successfully
    if [[ "$line" == *"Uploading"* ]]; then
        echo "✅ Upload started successfully!"
    fi
    if [[ "$line" == *"deployed successfully"* ]]; then
        echo "✅ Deployment successful!"
    fi
done

# Clean up
rm -f deploy.tar 2>/dev/null

echo ""
echo "📌 Deployment process completed!"
echo "🌐 Check your app at: https://menuqr.apps.dramanddraught.com"
echo ""
echo "If the deployment didn't complete, run this in your terminal:"
echo "  cd /Users/lentz/Documents/Development/Web/menuqr"
echo "  caprover deploy -n captain-01 -a menuqr"