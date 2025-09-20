#!/bin/bash

echo "🚀 Deploying to CapRover..."

# Add all changes
git add -A

# Commit with timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "Deploy: $TIMESTAMP" || echo "No changes to commit"

# Create deployment package
echo "Creating deployment package..."
git archive --format=tar HEAD > deploy.tar

# Try deployment with auto-answers
echo "Starting deployment..."
printf "main\ny\n" | caprover deploy --default 2>&1 | while IFS= read -r line; do
    echo "$line"
    if [[ "$line" == *"successfully"* ]]; then
        echo "✅ Deployment successful!"
        break
    fi
done

# Clean up
rm -f deploy.tar

echo "✅ Deployment script complete!"