---
name: sync-plugin-docs
description: Regenerate plugin-docs/CLAUDE.md from source code and agent-notes to prevent documentation drift.
allowed-tools: Read, Glob, Grep, Write, Bash(git*)
---

Regenerate `plugin-docs/CLAUDE.md` — the consumer-facing plugin reference deployed to vaults via `/local-deploy`.

## Goal

The exported `plugin-docs/CLAUDE.md` is the agent memory for any vault consuming this plugin. Its purpose is to give agents enough context to **utilize and manipulate Powerbase effectively within an Obsidian project** — configuring `.base` files, setting up relations/rollups/bidi sync, editing views programmatically, and troubleshooting issues without trial and error.

## GitHub Repository

The plugin source code lives at **https://github.com/ran-codes/obsidian-powerbase**. The exported doc MUST include this repo URL and a note telling consumer agents that the `main` branch of this repository is the source of truth for plugin behavior. If agents need details beyond what the exported doc covers (e.g., edge cases, internal logic, undocumented behavior), they should examine the repository's `main` branch directly.

## Why this skill exists

If the exported doc drifts from the source code, agents make wrong assumptions about config format, detection behavior, etc. (e.g., putting config inside `options:` instead of view-level flat keys). This skill prevents that drift by regenerating docs from the actual source code and agent-notes.

## Version detection

Detect the current version by listing folders in `.claude/reference/` and picking the most recent semantic version (e.g., `v0.1`, `v0.2`). Use this version to:
- Read agent-notes from `.claude/reference/<version>/agent-notes/`
- Read ADRs from `.claude/reference/<version>/adr/`
- Stamp the output doc with a version header: `<!-- Powerbase docs <version> -->`

## Sources of truth

Read these in order to build the exported doc. **Never invent — only document what the code actually does.**

### 1. Source code (primary)

Scan these files for current behavior:

| File | What to extract |
|------|----------------|
| `src/relational-table-view.ts` | `detectRelationColumn()` — active detection patterns; `getRollupConfigs()` / `getBidiConfigs()` / `getQuickActionConfigs()` — config key names; `getBaseFolder()` — folder resolution logic; `getViewOptions()` — available config panel options; `detectColumnType()` — column type inference |
| `src/services/RollupService.ts` | `aggregate()` — aggregation type names and behavior |
| `src/services/BidirectionalSyncService.ts` | Sync mechanism |
| `src/services/EditEngineService.ts` | Write queue timing |
| `src/services/ParseService.ts` | `WIKILINK_REGEX`, value formatting |
| `src/types.ts` | Type definitions for configs |

### 2. Agent notes (friction points)

Read **all files** in `.claude/reference/<version>/agent-notes/`. Each note describes a specific gotcha that MUST be reflected in the exported doc. These are hard-won lessons — never omit them.

### 3. Architecture decisions

Scan `.claude/reference/<version>/adr/` for any decisions that affect consumer-facing behavior.

## Output structure

Write to `plugin-docs/CLAUDE.md` with this structure:

```
# Powerbase — Plugin Reference
## What This Plugin Adds (vs Vanilla Bases)
## View Setup
## Property ID Conventions
## Configuration
  → CRITICAL: explain that config keys are VIEW-LEVEL FLAT KEYS, not inside options:
  → Show correct .base YAML examples (not JSON, not nested in options)
## Feature Reference
  ### Relation Columns
  ### Rollup Columns
  ### Bidirectional Sync
  ### Quick Actions
  ### Date / Datetime Columns
  ### Priority Enhanced UI
  ### Column Context Menu
  ### File Context Menu
  ### Group-By
  ### Inline Editing
## Complete .base Example
  → Must use correct YAML format with view-level flat keys
## Agent Notes
  → Summarize each file from agent-notes/ as a subsection
## Troubleshooting
```

## Rules

- **YAML, not JSON** — `.base` files are YAML. All examples must be YAML.
- **View-level flat keys** — Config keys (`rollupCount`, `rollup1_relation`, `bidiCount`, `quickActions`, `colType_*`, `priorityEnhanced_*`) go as sibling keys to `order`, `sort`, `groupBy` on the view object. NEVER show them inside `options:`.
- **Match the code exactly** — If `detectRelationColumn()` only uses folder matching, document only folder matching. Count the patterns in the actual function, don't copy from old docs.
- **Include all agent-notes** — Every file in `agent-notes/` must appear in the Agent Notes section.
- **No invented features** — If you can't find it in source code, don't document it.

## After generating

1. Show a diff summary of what changed
2. Remind the user to run `/local-deploy` to push the updated docs to their vault
