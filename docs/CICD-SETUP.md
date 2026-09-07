# CI/CD Setup

## Overview

The CI/CD pipeline (`.github/workflows/ci-local.yml`) runs on every push to `main`
and on pull requests. On tagged releases (`v*`), it builds Windows installers and
creates a draft GitHub release.

## Pipeline Steps

1. **Checkout** - Pulls the repository
2. **Setup Node 20** - Installs Node.js with npm caching
3. **Install dependencies** - `npm ci`
4. **Lint** - `node scripts/lint.mjs`
5. **Typecheck** - `npx tsc --noEmit -p tsconfig.json`
6. **Unit tests** - `node scripts/test-unit.mjs`
7. **Build** - `npm run build` (electron-vite)
8. **Smoke test** - `node scripts/smoke.mjs`
9. **Build installer** (tag push only) - `npm run build:win`
10. **Upload artifacts** (tag push only) - Uploads `.exe` files as build artifacts
11. **Create draft release** (tag push only) - Creates a GitHub release with artifacts

## Setting Up the PAT

The workflow file stays local because it requires a Personal Access Token (PAT)
with workflow scope to push changes to GitHub Actions workflows.

1. Go to GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens
2. Create a new token with:
   - Repository access: `shop-ledger-ph`
   - Permissions: `Contents` (read/write), `Actions` (read/write), `Workflows` (read/write)
3. Copy the token
4. Add it as a repository secret named `PAT` in Settings > Secrets and variables > Actions

## Pushing the Workflow

To push the workflow file to GitHub:

```bash
# Using the PAT
git remote set-url origin https://<PAT>@github.com/stephenruma8-star/shop-ledger-ph.git
git add .github/workflows/ci-local.yml
git commit -m "ci: add CI/CD workflow"
git push origin main
git remote set-url origin https://github.com/stephenruma8-star/shop-ledger-ph.git
```

**Important**: The workflow file name `ci-local.yml` is intentional. It will run when
pushed to GitHub, but the name signals it's the local-only workflow that requires
manual management.

## Creating a Release

1. Update `version.json` and `package.json` with the new version
2. Commit and tag:
   ```bash
   git add -A
   git commit -m "release: v3.13.0"
   git tag v3.13.0
   git push origin main --tags
   ```
3. The workflow will automatically:
   - Build the app
   - Build the NSIS installer and portable exe
   - Create a draft release on GitHub with the artifacts
4. Go to GitHub Releases, review the draft, and publish it

## Manual Steps

- **Code signing**: Run `scripts/generate-self-signed-cert.ps1` as Administrator to
  create a dev certificate (see docs/CODE-SIGNING.md)
- **Release notes**: Write release notes manually in the GitHub release before publishing
- **Testing**: Test the installer on a clean Windows machine before publishing
