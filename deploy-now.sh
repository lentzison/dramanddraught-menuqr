#!/bin/bash

echo "Deploying to CapRover..."

# Create a tar file
git archive --format=tar --output=deploy.tar HEAD

# Use expect to handle the interactive prompts
cat > deploy-expect.sh << 'EOF'
#!/usr/bin/expect -f
spawn caprover deploy -n captain-01 -a menuqr
expect "git branch name to be deployed:"
send "main\r"
expect "Are you sure you want to deploy?"
send "y\r"
expect eof
EOF

chmod +x deploy-expect.sh

# Check if expect is installed
if command -v expect &> /dev/null; then
    ./deploy-expect.sh
else
    echo "Running manual deployment..."
    caprover deploy -n captain-01 -a menuqr -b main
fi

# Clean up
rm -f deploy-expect.sh deploy.tar

echo "Deployment command executed!"