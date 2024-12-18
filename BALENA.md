# Maintaining a fork of safe-settings for balena

## Goals

Maintain a fork of safe-settings that allows both ease of testing, and streamlined contributions upstream.

The fork branches and tags should always mirror upstream for ease of development.

The fork should hide its customizations in a side branch so we do not need to constantly rebase our feature branches, or accidentally contribute these customizations upstream.

## Sync upstream branches and tags

We retain a `balena/main` branch with customizations as the default branch of the fork.

A scheduled workflow in this branch includes a sync fork job to force sync all upstream branches and tags with origin.
Branches that exist in the fork but do not exist upstream are ignored. Local changes to branches that exist upstream are removed!

See: <https://github.com/repo-sync/github-sync>

## Sync balena/main with upstream

Occasionally we should manually rebase `balena/main` with upstream `main-enterprise` to ensure we have the latest changes.

```bash
git fetch
git checkout balena/main
git rebase origin/main-enterprise
```

This is not critical as development branches should be based on `main-enterprise` and not `balena/main`.

## Contributing

1. Create a `balena/feature-x` or `balena/fix-x` branch or similar based on `main-enterprise` for testing changes. Do not open a pull request at this time, just work on the branch.
2. When ready, use the `Create pre-release` workflow dispatch job to generate a tagged release and image.

    > Use workflow from: `balena/feature-x`
    >
    > Bump: `patch`
    >
    > Prerelease: `withBuildNumber`
    >
    > Prelabel: `snapshot`

3. Once changes are tested, a PR can be opened against the upstream `main-enterprise` branch. Do not open a PR with the base `balena/main` as it will not be merged.
