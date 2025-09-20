# MenuQR Deployment Guide

## Overview
This deployment uses CapRover's tar file method with a captain-definition containing dockerfileLines.

## Deployment Methods

### 1. Quick Deploy (Recommended)
```bash
npm run deploy
```
This runs the deploy.sh script automatically.

### 2. Manual Deploy
```bash
./deploy.sh
```

### 3. Force Deploy (with git commit)
```bash
npm run deploy:force
```
This creates an empty commit and deploys.

## What the Deployment Does

1. **Creates captain-definition** - Defines the Docker build instructions
2. **Creates tar archive** - Packages only necessary files (excludes node_modules, .git, etc.)
3. **Deploys to CapRover** - Uses the CapRover CLI with tar file method
4. **Cleans up** - Removes temporary files

## Files Included in Deployment

- `server.js` - Main server file
- `captain-definition` - Created during deployment

## CapRover Configuration

- **URL**: https://captain.apps.dramanddraught.com
- **App Name**: menuqr
- **Port**: 3000 (required by CapRover)

## Access the App

Once deployed, the app is available at:
https://menuqr.apps.dramanddraught.com

## Troubleshooting

### 502 Error
If you see an NGINX 502 error:
1. Check CapRover logs for the app
2. Ensure the app is listening on port 3000
3. Verify the Dockerfile CMD is correct

### Deployment Fails
If deployment fails:
1. Ensure you're logged into CapRover CLI
2. Check that the app exists in CapRover
3. Verify network connectivity to CapRover server

## Required Setup

1. CapRover CLI must be installed:
```bash
npm install -g caprover
```

2. Must be logged into CapRover:
```bash
caprover login
```

## Notes

- The deployment uses a minimal Docker image (node:20-alpine)
- Only the server.js file is copied to keep the image small
- No build step is required as this is a simple Node.js server