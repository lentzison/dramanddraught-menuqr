#!/bin/bash

clear
echo "=================================="
echo "   CAPROVER DEPLOYMENT HELPER     "
echo "=================================="
echo ""

# Navigate to project directory
cd /Users/lentz/Documents/Development/Web/menuqr

# Commit any pending changes
echo "📝 Preparing files for deployment..."
git add -A 2>/dev/null
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null || echo "✅ No new changes to commit"

# Show current status
echo ""
echo "📦 Project: menuqr"
echo "🌿 Branch: $(git branch --show-current)"
echo "📍 Latest commit: $(git log -1 --oneline)"
echo ""

echo "=================================="
echo "  RUN THIS COMMAND:"
echo "=================================="
echo ""
echo "caprover deploy -n captain-01 -a menuqr"
echo ""
echo "When prompted:"
echo "  • Git branch: main"
echo "  • Deploy? y"
echo ""
echo "=================================="
