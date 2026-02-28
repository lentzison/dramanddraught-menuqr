# Deployment and Automation Workflow

This project deploys to CapRover automatically using GitHub Actions whenever `main` is updated.

## Current flow

1. Push changes to `main` in GitHub.
2. GitHub Actions workflow (`.github/workflows/deploy.yml`) runs on that push.
3. The workflow runs `./deploy-ci.sh`.
4. `deploy-ci.sh`:
   - packages the repository into `deploy.tar`
   - deploys using `caprover deploy` with `CAPROVER_APP_TOKEN`
   - waits and checks app health at the app URL.

## What triggers deployment

- `push` event on branch `main`
- manual run via Actions (`workflow_dispatch`) if needed

## Required GitHub Action secrets

Set these in GitHub → Settings → Secrets and variables → Actions:

- `CAPROVER_APP_TOKEN`  
  - App token from CapRover (Apps → menuqr → Deployment → App Token)
- `CAPROVER_URL`  
  - e.g. `https://captain.apps.dramanddraught.com`

Optional if your app URL differs:

- `CAPROVER_APP_URL` (optional)  
  - app URL used for deployment health check in `deploy-ci.sh`

## Useful npm scripts

- `npm run deploy:trigger`  
  - creates an empty commit and pushes `main`
  - useful for forcing a webhook deploy when code is already pushed or unchanged
- `npm run deploy` / `npm run deploy:ci`  
  - runs local non-interactive deploy with `deploy-ci.sh`
- `npm run deploy:force`  
  - local deploy helper that creates an empty commit and runs deploy

## How to do a normal deploy

From your local machine:

```bash
git add .
git commit -m "Your change summary"
git push origin main
```

That push triggers GitHub Actions and should deploy automatically.

## How to force a deploy without code changes

```bash
npm run deploy:trigger
```

This is useful for re-running deployment from the same codebase.

## Where deployment settings live

- Workflow: `.github/workflows/deploy.yml`
- Deploy script: `deploy-ci.sh`
- Deployment notes and troubleshooting: `deployment.md`

## Quick verification

After a push:

1. Go to GitHub → Actions → `Deploy to CapRover`
2. Confirm workflow run is green
3. Confirm app is responsive at:
   - `https://menuqr.apps.dramanddraught.com`

If the workflow fails, open the run logs and check:

- missing/invalid GitHub secrets
- CapRover URL accessibility
- CapRover deployment errors in logs

