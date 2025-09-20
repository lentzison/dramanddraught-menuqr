#!/bin/bash

echo "🚀 Automated CapRover Deployment"

# Commit changes
git add -A 2>/dev/null
git commit -m "Auto-deploy $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null || true

# Create tar file
git archive --format=tar HEAD -o deploy.tar

echo "📦 Starting deployment..."

# Run deployment with expect to handle prompts
expect -c "
    set timeout 120
    spawn caprover deploy -n captain-01 -a menuqr
    expect \"branch name\" { send \"main\r\" }
    expect \"deploy?\" { send \"y\r\" }
    expect {
        \"Uploading\" {
            puts \"📤 Uploading to CapRover...\"
            exp_continue
        }
        \"Building\" {
            puts \"🔨 Building Docker image...\"
            exp_continue
        }
        \"successfully\" {
            puts \"✅ Deployment successful!\"
        }
        \"failed\" {
            puts \"❌ Deployment failed\"
            exit 1
        }
        timeout {
            puts \"⏱️ Deployment timed out\"
        }
    }
"

rm -f deploy.tar
echo ""
echo "🌐 Check app at: https://menuqr.apps.dramanddraught.com"