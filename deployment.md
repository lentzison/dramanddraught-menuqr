# MenuQR Deployment Guide

## Overview
This deployment uses CapRover's tar file method with a `captain-definition` pointing to the Dockerfile.

## Deployment Methods

### 1. Non-Interactive (App Token) — Recommended
This requires no prompts and no saved machine config.

1) In CapRover dashboard → Apps → `menuqr` → Deployment → App Token → Enable and copy the token.
2) In your shell, export the token and run the script:
```bash
export CAPROVER_APP_TOKEN=YOUR_APP_TOKEN
npm run deploy:ci
```
This uses `deploy-ci.sh` and `caprover deploy --appToken ... --tarFile ...`.

### 2. Trigger a webhook deploy from git push
```bash
npm run deploy:trigger
```
This creates an empty commit and pushes `main`; your GitHub Action will start on push automatically.

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

- `index.js` - Main server file
- `captain-definition` - Points to Dockerfile

## CapRover Configuration

- **URL**: https://captain.apps.dramanddraught.com
- **App Name**: menuqr
- **Ports**: Container listens on 3000 and 80; CapRover default (80) works.

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

2. For App Token deploys, no login is required.

## Notes

- The deployment uses a minimal Docker image (node:20-alpine)
- App code is copied; no build step required
- Server is bound on both 3000 and 80 for compatibility

## Security Notes

- Prefer App Tokens over embedding the CapRover admin password in scripts.
- Store `CAPROVER_APP_TOKEN` in CI/CD secrets or your shell profile, not in the repo.
