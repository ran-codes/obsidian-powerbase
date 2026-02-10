# v0.1 Reference Documentation

Design documents for the initial release of Powerbase. Read in order for full context, or jump to a specific phase.

## Reading Order

### 1. Context & Feasibility
- **[initial-idea.md](initial-idea.md)** — Problem statement: why Obsidian needs relations and rollups
- **[initial-evaluation.md](initial-evaluation.md)** — Feasibility verdict, API analysis, framework and library decisions, lessons from DB Folder

### 2. Implementation Plans
- **[plan-phases.md](plan-phases.md)** — High-level checklist of all three phases
- **[plan-phase-1.md](plan-phase-1.md)** — MVP: plugin scaffold, services layer (EditEngine, Parse, NoteSearch), TanStack Table, relation picker (react-select), view options
- **[plan-phase-2.md](plan-phase-2.md)** — Rollups: RollupService, aggregation functions (10 types), per-render caching, view option config
- **[plan-phase-3.md](plan-phase-3.md)** — Polish: bidirectional sync (atomic processFrontMatter), editing parity with vanilla Bases, column resizing, grouping, summary row, keyboard navigation

### 3. Post-Implementation Updates
After building all three phases, the codebase was updated based on real-world testing against a production vault (`D:\GitHub\work`):

- **Text-reference relations**: Added support for `project: "My Project"` pattern (string matching vault file basenames/aliases), not just wikilink lists
- **NoteSearchService**: Added `resolveTextReference()` and `isTextReference()` for alias-aware resolution
- **RollupService**: Enhanced `resolveLinks()` to handle both wikilinks and text references
- **DRY cleanup**: Exported `WIKILINK_REGEX` from ParseService, extracted `toNumbers()` and `filterNonNull()` helpers in RollupService

## Key Decisions Summary

| Decision | Chosen | Why |
|---|---|---|
| View approach | Custom Bases View (not monkey-patch) | Official API, inherits query engine |
| Table library | TanStack Table (headless) | Proven in DB Folder, 27.7k stars, React support |
| UI framework | React (not Svelte) | TanStack editable examples only work for React |
| State management | Zustand | Lightweight, no boilerplate |
| Relation picker | react-select CreatableSelect | Search + create inline, portal rendering |
| Frontmatter writes | EditEngineService (debounced queue) | 250ms debounce, 25ms between ops |
| Bidi sync writes | processFrontMatter (atomic) | Avoids stale cache race conditions |
| Rollup caching | Per-render-cycle Map | Rebuilt each render, no stale data |
