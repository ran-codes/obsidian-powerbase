# Powerbase

Obsidian community plugin that extends Bases with relation columns, rollups, and bidirectional sync. Registers a custom "Relational Table" view via the Bases Plugin API (v1.10.0+).

## Rules

- Be Concise - i like quick responses to iterate quickly. Save long responses for when asked about details or planning.
- **Always build & deploy after changes.** When iteratively developing locally, always `npm run build` and copy output files to the vault after every code change — don't wait to be asked.
- Tool use
  - **Minimize tool calls.** Use Grep, Read, Glob directly — they're fast and parallel. Never spawn a Task agent (subagent) for simple file reads or searches.
  - **No heavyweight agents for simple operations.** If a skill just needs to read/grep a handful of files, do it inline. If you think a Task agent is needed, ask me first.
- Formatting
  - **No empty lines between bullet points.** Keep bullet lists compact.
  - Empty lines only between major sections (after headings).
  - **Spaces in task filenames are fine.** Obsidian handles them natively. Folder names still use hyphens (YYYY-MM-DD format). Double hyphens for date ranges: `archive/2026-01-20--2026-01-23/`
  -

## Quick Start

```bash
npm install
npm run build        # production build → main.js
npm run dev          # watch mode for development
```

Deploy to a vault: copy `main.js`, `manifest.json`, `styles.css`, and `plugin-docs/CLAUDE.md` to `<vault>/.obsidian/plugins/powerbase/`. Use `/local-deploy` skill for automated deployment.

## Iteration Workflow

After any code change, always:
1. `npm run build`
2. Copy `main.js`, `manifest.json`, `styles.css`, and `plugin-docs/CLAUDE.md` to `D:/GitHub/work/.obsidian/plugins/powerbase/`

Do not wait for the user to call `/local-deploy` — build and deploy automatically after each change.

## Architecture

```
src/
  main.ts                          # Plugin entry: registerBasesView()
  relational-table-view.ts         # BasesView subclass, data transform, React mount
  types.ts                         # Shared TypeScript interfaces
  services/
    EditEngineService.ts           # Debounced frontmatter write queue (250ms)
    ParseService.ts                # Wikilink parsing, value formatting
    NoteSearchService.ts           # Note discovery: basename, alias, wikilink resolution
    RollupService.ts               # Rollup computation: link resolution + aggregation
    BidirectionalSyncService.ts    # Back-link sync via processFrontMatter (atomic)
  stores/
    tableStore.ts                  # Zustand store (focus, column sizing) — scaffolding, not yet consumed
  components/
    RelationalTable.tsx            # TanStack Table: resizing, grouping, keyboard nav
    AppContext.tsx                  # React context for Obsidian App instance
    cells/
      RelationCell.tsx             # Wikilink chip display + edit toggle
      EditableCell.tsx             # Inline editing (parity with vanilla Bases)
      RollupCell.tsx               # Read-only aggregated value display
    editors/
      RelationEditor.tsx           # react-select CreatableSelect picker (folder-filtered)
      TextEditor.tsx               # Inline text/number input
```

## Critical Runtime Knowledge

**Obsidian Value objects** have runtime shape `{ icon, data, lazyEvaluator? }` — NOT `.values` or `.value`. The `unwrapValue()` method in `relational-table-view.ts` must use `.data` to extract primitives. See `obsidian-value-api.md` for full details. This was discovered through runtime debugging and is not documented in the `.d.ts` types.

## Key Patterns

- **Bases API**: `BasesView` subclass receives `onDataUpdated()` with pre-filtered/sorted `BasesQueryResult`. View options configured via `getViewOptions()` static method, rendered by Bases in the **Configure view** panel, read via `this.config.get(key)`.
- **Relation detection** (`detectRelationColumn()`): Four patterns — 1a) wikilink arrays matching `WIKILINK_REGEX`, 1b) arrays of strings resolving to vault files, 2) scalar strings matching basenames/aliases (scans first 10 rows), 3) property name matches a subfolder (e.g. `project` → `projects/` exists) — catches empty columns.
- **Relation picker folder filtering**: Per-column. Infers subfolder from property name (e.g., `project` → `projects/`). Falls back to base folder (entries' common parent, one level up). See `adr/relation-columns.md`.
- **Rollup pipeline**: `getRollupConfigs()` → `RollupService.computeRollups()` → inject into rows → add columns. Per-render frontmatter cache avoids redundant reads.
- **Bidirectional sync**: Uses `processFrontMatter()` for atomic read+write to avoid race conditions when multiple back-links target the same file.
- **Write persistence**: Debounced queue (250ms debounce, 25ms between ops) via `EditEngineService`.

## Reference Documentation

Detailed plans and architectural decisions are in `.claude/reference/v0.1/`:

| Document                | Content                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `obsidian-value-api.md` | **CRITICAL**: Runtime shape of Obsidian Value objects (`.data`, not `.values`/`.value`) |
| `adr/`                  | Architecture decision records for each major feature                                    |
| `initial-idea.md`       | Problem statement and market opportunity                                                |
| `initial-evaluation.md` | Feasibility analysis, API capabilities, framework decisions                             |
| `plan-phases.md`        | High-level phase checklist                                                              |
| `plan-phase-1.md`       | Phase 1: MVP scaffold, services, table, relation picker                                 |
| `plan-phase-2.md`       | Phase 2: Rollup columns, aggregation functions, caching                                 |
| `plan-phase-3.md`       | Phase 3: Bidirectional sync, editing parity, polish                                     |
| `test-v1/`              | Test fixture files (copy to vault for testing)                                          |

## Important Conventions

- `BasesPropertyId` strings use dot notation: `note.property-name` for frontmatter, `file.name` for file metadata
- `extractPropertyName()` strips the prefix: `"note.related-projects"` → `"related-projects"`
- `WIKILINK_REGEX` is the single source of truth (exported from `ParseService.ts`)
- React components use `require()` for lazy loading inside the view class (avoids top-level React imports in the Obsidian plugin entry)
- All frontmatter writes go through `EditEngineService` (debounced) or `processFrontMatter` (atomic, for bidi sync)
- The Bases Plugin API does NOT support custom property types, custom column types, or intercepting the built-in table — only custom view types
