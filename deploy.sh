#!/bin/bash

# MenuQR App Deployment Script
# Based on the working bartender deployment

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   MenuQR App Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"

# Configuration
TAR_FILE="deploy.tar.gz"
CAPROVER_URL="https://captain.apps.dramanddraught.com"
APP_NAME="menuqr"

# 1. Clean up old files
echo -e "\n${YELLOW}Step 1: Cleaning up old deployment files...${NC}"
rm -f $TAR_FILE
rm -f captain-definition

# 2. Create captain-definition
echo -e "\n${YELLOW}Step 2: Creating captain-definition...${NC}"
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
echo -e "${GREEN}✓ captain-definition created${NC}"

# 3. Create deployment archive
echo -e "\n${YELLOW}Step 3: Creating deployment archive...${NC}"
tar --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.tar' \
    --exclude='*.tar.gz' \
    --exclude='.env.local' \
    --exclude='tmp' \
    --exclude='temp' \
    --exclude='deploy.tar.gz' \
    -czf $TAR_FILE .

FILE_SIZE=$(ls -lh $TAR_FILE | awk '{print $5}')
echo -e "${GREEN}✓ Archive created: $TAR_FILE ($FILE_SIZE)${NC}"

# 4. Deploy to CapRover
echo -e "\n${YELLOW}Step 4: Deploying to CapRover...${NC}"
echo -e "URL: $CAPROVER_URL"
echo -e "App: $APP_NAME"
echo ""

# Try to deploy with the tar file
caprover deploy --caproverUrl $CAPROVER_URL --caproverApp $APP_NAME --tarFile ./$TAR_FILE

# 5. Cleanup
echo -e "\n${YELLOW}Step 5: Cleaning up...${NC}"
rm -f captain-definition
echo -e "${GREEN}✓ Cleanup complete${NC}"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}   Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\nYour app should be available at:"
echo -e "${GREEN}https://menuqr.apps.dramanddraught.com${NC}"