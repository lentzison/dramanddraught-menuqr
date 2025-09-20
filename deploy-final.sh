#!/bin/bash

echo "🚀 CapRover Deployment Script"
echo "=============================="

# Ensure we're in the right directory
cd /Users/lentz/Documents/Development/Web/menuqr

# Commit any changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Committing changes..."
    git add -A
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    git commit -m "Deploy: $TIMESTAMP"
fi

echo ""
echo "📦 Creating deployment tarball..."

# Method 1: Create tar and try deployment with saved config
git archive --format=tar HEAD > deploy.tar

echo "🚢 Starting deployment to CapRover..."
echo ""

# Use a background process to feed inputs
(
    sleep 2
    echo "main"
    sleep 1
    echo "y"
) | caprover deploy --default 2>&1 | tee deploy.log | grep -E "Uploading|Building|Deploy|successfully|failed|Error" || true

# Check the log for success
if grep -q "successfully" deploy.log 2>/dev/null; then
    echo ""
    echo "✅ DEPLOYMENT SUCCESSFUL!"
    echo "🌐 Your app is live at: https://menuqr.apps.dramanddraught.com"
else
    echo ""
    echo "⚠️  Deployment may need manual completion"
    echo ""
    echo "To complete deployment manually, run:"
    echo "  caprover deploy --default"
    echo ""
    echo "When prompted:"
    echo "  - Branch: main"
    echo "  - Confirm: y"
fi

# Clean up
rm -f deploy.tar deploy.log 2>/dev/null

echo ""
echo "=============================="
echo "Deployment script finished"