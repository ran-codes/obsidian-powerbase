# Deployment: GitHub Actions Release Workflow

## Status: Planned (not yet implemented)

## Goal

Add CI/CD so BRAT (and eventually the Obsidian community registry) can install Powerbase from GitHub Releases.

## What to add

Single file: `.github/workflows/release.yml` — the exact workflow from [official Obsidian docs](https://docs.obsidian.md/plugins/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions).

Triggers on tag push, builds from source, creates a **draft** release with `main.js`, `manifest.json`, `styles.css` attached.

## How to release

1. Update `version` in `manifest.json` and `package.json`
2. Update `versions.json` if min Obsidian version changed
3. Commit the version bump
4. `git tag -a 0.2.0 -m "0.2.0"` (tag must match manifest version, **no `v` prefix**)
5. `git push origin 0.2.0`
6. Workflow runs → draft release appears → publish it

## BRAT compatibility

BRAT downloads `main.js`, `manifest.json`, `styles.css` from the **latest GitHub Release assets** (not repo root). The workflow attaches exactly these 3 files. No other config needed — just give BRAT the repo URL.
