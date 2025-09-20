#!/bin/bash

# MenuQR Simple Deployment

echo "🚀 MenuQR Deployment Starting..."

# Configuration
TAR_FILE="deploy.tar.gz"

# Clean up
rm -f $TAR_FILE captain-definition

# Create captain-definition
cat > captain-definition << 'EOF'
{
  "schemaVersion": 2,
  "dockerfileLines": [
    "FROM node:20-alpine",
    "WORKDIR /app",
    "COPY server.js .",
    "EXPOSE 3000",
    "CMD [\"node\", \"server.js\"]"
  ]
}
EOF

# Create tar
tar -czf $TAR_FILE server.js captain-definition

echo "📦 Package created: $(ls -lh $TAR_FILE | awk '{print $5}')"

# Set environment variables for CapRover
export CAPROVER_URL="https://captain.apps.dramanddraught.com"
export CAPROVER_PASSWORD="LintVtechs0602!"
export CAPROVER_APP="menuqr"

# Try deployment with environment variables
echo "🚢 Deploying to CapRover..."
caprover deploy --caproverUrl "$CAPROVER_URL" --caproverPassword "$CAPROVER_PASSWORD" --caproverApp "$CAPROVER_APP" --tarFile ./$TAR_FILE 2>&1

# Clean up
rm -f captain-definition $TAR_FILE

echo "✅ Deployment script completed"
echo "🌐 Check: https://menuqr.apps.dramanddraught.com"