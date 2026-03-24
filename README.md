# Maintaining a fork of safe-settings for balena

## Overview

This is a fork of [github/safe-settings](https://github.com/github/safe-settings) maintained for balena's use.

The `main-enterprise` branch tracks upstream and must be updated manually (see [Syncing with upstream](#syncing-with-upstream)). **Do not commit directly to `main-enterprise`.**

The `balena/main` branch contains our custom GitHub workflows and is the default branch of the fork. It is not intended for application code changes.

## Branch Structure

| Branch | Purpose |
|--------|---------|
| `main-enterprise` | Tracks upstream. Manually synced. Use as base for development branches. |
| `balena/main` | Custom workflows only. Default branch of the fork. |
| `balena/*` | Development branches for testing and contributions. |

## Syncing with upstream

The fork does not use an automated sync workflow because upstream contains `.github/workflows/` files, and the `GITHUB_TOKEN` lacks `workflow` write permissions needed to push those changes.

Instead, sync `main-enterprise` manually using one of these approaches:

### Option A: GitHub UI (simplest)

1. Go to the fork on GitHub.
2. Switch to the `main-enterprise` branch.
3. If GitHub shows "This branch is N commits behind", click **Sync fork** > **Update branch** (or **Discard N commits** to hard reset).

### Option B: Local rebase

```bash
# Add upstream remote (one-time setup)
git remote add upstream https://github.com/github/safe-settings.git

# Fetch and hard-reset main-enterprise to match upstream
git fetch upstream
git checkout main-enterprise
git reset --hard upstream/main-enterprise
git push --force-with-lease origin main-enterprise
```

After syncing, rebase any active `balena/*` development branches onto the updated `main-enterprise`.

## Contributing

### Creating a development branch

Create your branch from either `main-enterprise` (for upstream contributions) or an existing `balena/*` branch (for balena-specific work):

```bash
# For upstream contributions
git fetch origin
git checkout -b balena/feature-x origin/main-enterprise

# For balena-specific work or building on existing balena changes
git fetch origin
git checkout -b balena/feature-y origin/balena/some-existing-branch
```

### Testing changes

1. Push your `balena/feature-x` branch to the fork.
2. Use the `Create pre-release` workflow dispatch job to generate a tagged release and image:

    > Use workflow from: `balena/feature-x`
    >
    > Bump: `patch`
    >
    > Prerelease: `withBuildNumber`
    >
    > Prelabel: `snapshot`

### Opening a pull request

- **For upstream contributions:** Open a PR against the upstream `main-enterprise` branch at [github/safe-settings](https://github.com/github/safe-settings).
- **For balena-specific workflow changes:** Open a PR against `balena/main`.

Do not open PRs with `main-enterprise` as the base in this fork.
