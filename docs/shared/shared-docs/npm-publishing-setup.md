# NPM Publishing Setup for job-finder-shared-types (Archived)

> **Note:** The shared type definitions now live directly in the monorepo under `shared/src` and are no longer published to npm. This document remains for historical context.

## Overview

The `job-finder-shared-types` repository is now configured with automated npm publishing via GitHub Actions. When changes are merged to the `main` branch, the package will automatically be published to npm if the version number has changed.

## What Was Added

### GitHub Workflows

1. **CI Workflow** (`.github/workflows/ci.yml`)
   - Runs on all pull requests and pushes to main/staging
   - Type checks TypeScript code
   - Builds the package
   - Verifies build output

2. **Publish Workflow** (`.github/workflows/publish.yml`)
   - Runs automatically when code is merged to main
   - Checks if the version in `package.json` has changed
   - Publishes to npm if version is new (prevents duplicate publishes)
   - Creates git tags for releases
   - Requires `NPM_TOKEN` secret

## Setup Instructions

### Prerequisites

You need an npm account with publishing rights to the `@jsdubzw` scope.

### Step 1: Generate npm Token

1. Go to [npmjs.com](https://www.npmjs.com/) and sign in
2. Click on your profile picture → **Access Tokens**
3. Click **Generate New Token** → Choose **Automation**
4. Copy the generated token (you won't see it again!)

### Step 2: Add NPM_TOKEN to GitHub

1. Go to the repository settings:

   ```
   https://github.com/Jdubz/job-finder-shared-types/settings/secrets/actions
   ```

2. Click **New repository secret**

3. Fill in:
   - **Name**: `NPM_TOKEN`
   - **Secret**: Paste your npm token
   - Click **Add secret**

### Step 3: Verify Setup

After the PR is merged:

1. Go to the **Actions** tab in GitHub
2. You should see the "Publish to npm" workflow run
3. Check [npmjs.com](https://www.npmjs.com/package/@shared/types) to verify the package was published

## How to Publish a New Version

### Method 1: Using npm version command (Recommended)

```bash
# Bump version and create a commit
npm version patch  # for bug fixes (1.1.0 -> 1.1.1)
npm version minor  # for new features (1.1.0 -> 1.2.0)
npm version major  # for breaking changes (1.1.0 -> 2.0.0)

# Push to your branch
git push origin worker-a-job-finder-shared-types

# Create PR and merge to main
# GitHub Actions will automatically publish!
```

### Method 2: Manual version update

```bash
# Edit package.json and change the version number
# Example: "version": "1.1.0" -> "version": "1.2.0"

# Commit the change
git add package.json
git commit -m "chore: bump version to 1.2.0"

# Push and merge via PR
git push origin worker-a-job-finder-shared-types
```

### Method 3: Manual publishing (Emergency only)

If you need to publish manually without GitHub Actions:

```bash
npm login
npm run build
npm publish
```

## Workflow Behavior

### When Publish Runs

- ✅ Runs on every push to `main` branch
- ✅ Can be manually triggered via GitHub Actions UI

### When Package is Published

- ✅ Only when version in `package.json` has changed
- ✅ Only if the new version doesn't already exist on npm
- ✅ Creates a git tag (e.g., `v1.2.0`) after successful publish

### When Publish is Skipped

- ⏭️ Version in `package.json` hasn't changed
- ⏭️ Version already exists on npm
- ⏭️ No NPM_TOKEN secret configured

## Current Package Info

- **Package Name**: `@shared/types`
- **Current Version**: `1.1.0`
- **npm Registry**: https://www.npmjs.com/package/@shared/types
- **Access**: Public (anyone can install)

## Using the Published Package

Other projects can install the package:

```bash
npm install @shared/types
```

In TypeScript code:

```typescript
import {
  QueueItem,
  JobMatch,
  SchedulerConfig,
} from "@shared/types";
```

## Troubleshooting

### Workflow fails with "NPM_TOKEN not found"

- Make sure the `NPM_TOKEN` secret is configured in repository settings
- Token must have "Automation" permissions
- Token must not be expired

### Version already published error

- Check that you've incremented the version in `package.json`
- Use `npm version` command to avoid mistakes
- Check npm to see current published version

### Build fails

- Ensure TypeScript compiles without errors
- Run `npm test` locally before pushing
- Check the Actions tab for detailed error logs

## Next Steps

1. ⚠️ **Set up NPM_TOKEN secret** (see Step 2 above)
2. ✅ Merge PR #5 to publish current version
3. ✅ Future changes will auto-publish when version changes

## Related PRs

- Shared Types PR: https://github.com/Jdubz/job-finder-shared-types/pull/5
- Backend PR: https://github.com/Jdubz/job-finder-worker/pull/48
- Frontend PR: https://github.com/Jdubz/job-finder-FE/pull/11
