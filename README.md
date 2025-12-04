# Maintaining a fork of safe-settings for balena

## Overview

This is a fork of [github/safe-settings](https://github.com/github/safe-settings) maintained for balena's use.

The `main-enterprise` branch is force-synced daily with upstream via a scheduled workflow. **Do not commit directly to `main-enterprise`** as your changes will be overwritten.

The `balena/main` branch contains our custom GitHub workflows and is the default branch of the fork. It is not intended for application code changes.

## Branch Structure

| Branch | Purpose |
|--------|---------|
| `main-enterprise` | Force-synced daily with upstream. Use as base for development branches. |
| `balena/main` | Custom workflows only. Default branch of the fork. |
| `balena/*` | Development branches for testing and contributions. |

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

Do not open PRs with `main-enterprise` as the base in this fork—it will be overwritten by the sync.
