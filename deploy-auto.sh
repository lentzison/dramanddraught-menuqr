#!/bin/bash

echo "🚀 Automated CapRover Deployment"

# Commit changes
git add -A 2>/dev/null
git commit -m "Auto-deploy $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null || true

# Create tar file
git archive --format=tar HEAD -o deploy.tar

echo "📦 Deployment package ready"

# Use expect if available, otherwise use printf
if command -v expect >/dev/null 2>&1; then
    expect -c "
        set timeout 60
        spawn caprover deploy -n captain-01 -a menuqr
        expect \"branch name\"
        send \"main\r\"
        expect \"deploy?\"
        send \"y\r\"
        expect eof
    "
else
    # Use printf to provide answers
    printf 'main\ny\n' | caprover deploy -n captain-01 -a menuqr
fi

rm -f deploy.tar
echo "✅ Deployment complete!"