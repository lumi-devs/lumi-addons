---
title: Publishing Addons & Automated Versioning
description: How to maintain, version, and publish addons using Changesets and GitHub Actions.
emoji: "📦"
category: "Guides"
tags: ["changesets", "publishing", "versioning"]
---

Lumi Addons uses `@changesets/cli` to automate semver version bumps, changelog generation, and GitHub Releases across all addon directories.

## 1. Creating a Changeset

When making a change or bug fix in an addon, create a changeset:

```sh
bun run changeset
```

Follow the interactive prompts:
1. Select the bump type (`patch`, `minor`, or `major`).
2. Enter a summary of what changed.

This writes a markdown file into the `.changeset/` directory.

## 2. Automated Version Synchronization

When releasing:

```sh
bun run version:sync
```

This runs `@changesets/cli version` and automatically executes `scripts/version-sync.ts`, which synchronizes the version across:
- `package.json`
- `info.json` in every addon directory
- `manifest.json` in every addon directory
- `index.ts` version property in every addon module

## 3. GitHub Actions Release Workflow

When changes are pushed to `main`, the `.github/workflows/release.yml` workflow automatically:
1. Opens a &ldquo;Version Packages&rdquo; pull request grouping all pending changesets.
2. Once merged, publishes GitHub Releases and updates the addon manifest index.
