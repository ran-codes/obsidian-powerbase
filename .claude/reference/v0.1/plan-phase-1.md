# Phase 1 MVP: Powerbase — Relational Table View

## Summary

Scaffold an Obsidian community plugin from scratch that registers a custom Bases view ("Relational Table") with relation columns. Built with React + TanStack Table + Zustand + react-select, adopting proven architecture from the archived DB Folder plugin (99 releases, 1.4k stars).

---

## Key Architecture Decisions (from DB Folder)

| Decision | DB Folder Pattern (adopted) | Initial Plan (replaced) |
|---|---|---|
| State management | **Zustand** (lightweight, no boilerplate) | React useState only |
| Relation picker | **react-select CreatableSelect** with portal rendering | Obsidian SuggestModal |
| Editor dismiss | **ClickAwayListener** (from @mui/material) | Custom blur handlers |
| Cell edit mode | **dirtyCell flag pattern** (display/edit toggle) | blur-to-save only |
| Write persistence | **Debounced write queue** (250ms debounce, 25ms between ops) | Direct processFrontMatter |
| Data transformation | **ParseService pattern** (bidirectional display<->storage) | Ad-hoc unwrapValue |

---

## File Structure

```
D:\GitHub\obsidian-database-power-user\
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── versions.json
├── styles.css
├── .gitignore
├── src/
│   ├── main.ts                          # Plugin entry, registerBasesView()
│   ├── relational-table-view.ts         # BasesView subclass, React root mounting
│   ├── types.ts                         # Shared types
│   ├── services/
│   │   ├── EditEngineService.ts         # Debounced frontmatter write queue
│   │   ├── ParseService.ts             # Value <-> display/storage transforms
│   │   └── NoteSearchService.ts        # Note discovery via metadataCache
│   ├── stores/
│   │   └── tableStore.ts               # Zustand store for table state
│   ├── components/
│   │   ├── RelationalTable.tsx          # Main TanStack Table component
│   │   ├── cells/
│   │   │   ├── DefaultCell.tsx          # Read-only text/number/bool display
│   │   │   └── RelationCell.tsx         # Wikilink chips + edit mode toggle
│   │   ├── editors/
│   │   │   └── RelationEditor.tsx       # react-select CreatableSelect picker
│   │   └── AppContext.tsx               # React context for Obsidian App
```

---

## Dependencies

```json
{
  "dependencies": {
    "@tanstack/react-table": "^8.21.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-select": "^5.8.0",
    "zustand": "^4.5.0",
    "@mui/material": "^5.15.0",
    "@emotion/react": "^11.11.0",
    "@emotion/styled": "^11.11.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.25.0",
    "obsidian": "latest",
    "tslib": "^2.8.0",
    "typescript": "^5.6.0"
  }
}
```

---

## Implementation Steps

### Step 1: Scaffold build config

Create: `manifest.json`, `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `versions.json`, `.gitignore`

- `manifest.json`: id `"powerbase"`, minAppVersion `"1.10.0"`
- `tsconfig.json`: `"jsx": "react-jsx"`, target ES6, module ESNext, include `**/*.tsx`
- `esbuild.config.mjs`: entry `src/main.ts`, CJS output, externalize `obsidian`/`electron`/`@codemirror/*`/`@lezer/*`, dev watch mode + production minified
- Run `npm install && npm run build` to verify zero errors

### Step 2: Plugin entry + BasesView skeleton

Create: `src/main.ts`, `src/relational-table-view.ts`, `src/types.ts`

**`src/main.ts`** — Minimal entry:
- `registerBasesView('relational-table', { name, icon, factory, options })`
- Factory creates `RelationalTableView(controller, containerEl, plugin)`

**`src/relational-table-view.ts`** — BasesView subclass:
- `constructor(controller, containerEl, plugin)` calls `super(controller)`
- `onload()`: no-op initially
- `onunload()`: unmount React root
- `onDataUpdated()`: transform `this.data` → table data, render React
- `renderTable()`: create/reuse `createRoot(containerEl)`, render `<AppContext.Provider><RelationalTable /></AppContext.Provider>`

**`src/types.ts`** — Shared types:
- `TableRowData { file: TFile; [propertyId: string]: any }`
- `WikiLink { raw, path, display, resolvedFile? }`
- `ColumnMeta { propertyId, displayName, isRelation }`

Verify: `npm run build` succeeds.

### Step 3: Services layer (DB Folder patterns)

Create: `src/services/EditEngineService.ts`, `src/services/ParseService.ts`, `src/services/NoteSearchService.ts`

**`EditEngineService.ts`** — Debounced write queue (from DB Folder):
- `onFlyEditions: EditArgs[]` accumulator
- `updateRowFile(args)`: push to queue, clear/reset 250ms timeout
- On timeout: process batch sequentially with 25ms delays between ops
- Each op calls `app.fileManager.processFrontMatter(file, fm => { fm[key] = value })`
- Property name extracted from `BasesPropertyId` by stripping `note.` prefix

**`ParseService.ts`** — Bidirectional value transforms (from DB Folder):
- `unwrapValue(obsidianValue: Value): unknown` — duck-type Value hierarchy → JS primitives
- `parseForDisplay(raw, columnType): string` — format for cell display
- `parseForStorage(userInput, columnType): any` — format for YAML frontmatter
- `isRelationValue(value): boolean` — returns true if array where all elements match `[[...]]` regex
- `parseWikiLinks(value): WikiLink[]` — parse array of wikilink strings
- `formatAsWikiLink(path, alias?): string` — produce `"[[path]]"` or `"[[path|alias]]"`

**`NoteSearchService.ts`** — Note discovery (no Dataview dependency):
- `searchNotes(app, query): TFile[]` — `app.vault.getMarkdownFiles()` filtered by case-insensitive basename match, max 50 results
- `resolveWikiLink(app, linkPath, sourcePath): TFile | null` — `app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath)`

### Step 4: Zustand store (from DB Folder pattern)

Create: `src/stores/tableStore.ts`

```
useTableStore: {
  // State
  rows: TableRowData[]
  columns: ColumnMeta[]

  // Actions
  setData(rows, columns): void
  updateCell(rowIndex, columnId, value): void
}
```

- `setData` called from `onDataUpdated()` when Bases pushes new query results
- `updateCell` updates local state immediately (optimistic UI), then triggers `EditEngineService` for async persistence
- Bases engine detects frontmatter change → calls `onDataUpdated()` → `setData` replaces state with fresh data

### Step 5: React context + table component

Create: `src/components/AppContext.tsx`, `src/components/RelationalTable.tsx`

**`AppContext.tsx`**:
- `createContext<App>` + `useApp()` hook (standard Obsidian React pattern)

**`RelationalTable.tsx`** — Main table (TanStack Table):
- Extend `TableMeta` with `updateRelation` and `openRelationPicker`
- Build column defs from `ColumnMeta[]`:
  - `isRelation === true` → use `RelationCell`
  - otherwise → use `DefaultCell`
- `useReactTable({ data: rows, columns, getCoreRowModel(), manualSorting: true })`
  - `manualSorting: true` because Bases pre-sorts data
- Render `<table>` with `flexRender` for headers and cells
- Column order from `ColumnMeta[]` (already ordered by `config.getOrder()` in the view)
- Sort indicators read from Bases sort config (display only, not re-sorting)

### Step 6: Cell components (DB Folder dirtyCell pattern)

Create: `src/components/cells/DefaultCell.tsx`, `src/components/cells/RelationCell.tsx`

**`DefaultCell.tsx`** — Read-only for MVP:
- Renders text/number/boolean as plain text
- null → empty
- boolean → disabled checkbox
- arrays (non-relation) → comma-separated

**`RelationCell.tsx`** — Wikilink chips + edit toggle (DB Folder pattern):
- Display mode: render `WikiLink[]` as clickable chip `<span>` elements
  - Click chip → `app.workspace.openLinkText(link.path, file.path)` to navigate
  - "+" button to trigger edit mode
- Edit mode: `dirtyCell` flag → mount `<RelationEditor />`
- Double-click or Enter to toggle edit mode
- Uses Obsidian CSS vars for theme compatibility (`--text-accent`, `--background-modifier-hover`)

### Step 7: Relation editor (react-select CreatableSelect from DB Folder)

Create: `src/components/editors/RelationEditor.tsx`

**This is the core UX feature.** Adopts DB Folder's proven pattern:

```tsx
<ClickAwayListener onClickAway={handlePersist}>
  <CreatableSelect
    isMulti
    closeMenuOnSelect={false}
    isSearchable
    autoFocus
    menuPosition="fixed"
    menuPortalTarget={activeDocument.body}
    components={{ DropdownIndicator: () => null, IndicatorSeparator: () => null }}
    options={availableNotes}  // from NoteSearchService
    value={selectedLinks}
    onChange={handleChange}
  />
</ClickAwayListener>
```

- **Portal rendering** (`menuPortalTarget={activeDocument.body}`) — menu renders outside table DOM, no overflow/z-index issues
- **Multi-select** (`isMulti`) — select multiple relations without closing
- **Creatable** — type a new note name and create it inline
- On `create-option` action: create new file via `app.vault.create()`, add to selected
- On click-away: diff old vs new links, call `EditEngineService.updateRowFile()` for changed cells
- Options loaded from `NoteSearchService.searchNotes()` on mount + on input change

### Step 8: View options

Update: `src/relational-table-view.ts` — `getViewOptions()`

```typescript
static getViewOptions(): ViewOption[] {
  return [{
    type: 'dropdown',
    key: 'relationDetection',
    displayName: 'Relation Detection',
    default: 'auto',
    options: {
      'auto': 'Auto-detect (list of wikilinks)',
      'manual': 'Select property',
    },
  }];
}
```

- Auto-detect: scan first 10 rows, check if any `list` property has all wikilink elements
- Manual: user picks which property is the relation column

### Step 9: Styles

Create: `styles.css`

- `.relational-table-container` — full width, overflow-x auto
- `table` — border-collapse, full width
- `th` — sticky header, uppercase, muted text, Obsidian CSS vars
- `td` — padding, border-bottom
- `tr:hover` — background highlight
- `.relation-cell` — flex-wrap container
- `.relation-chip` — pill/tag style, `--text-accent` color, 12px border-radius, truncate with ellipsis
- `.relation-chip:hover` — underline, darker background
- `.relation-add-btn` — 20px circle, dashed border, "+" icon
- react-select overrides to match Obsidian theme (use CSS vars)

### Step 10: Wire and test

- Import everything in `relational-table-view.ts`
- Implement `renderTable()` fully: transform `BasesEntry[]` → `TableRowData[]` via `ParseService`, detect relation columns, mount React
- Implement `handleUpdateRelation()`: call `EditEngineService`
- Test with a vault containing notes with `list` properties of `[[wikilinks]]`
- Verify: view appears in Bases view switcher, table renders, chips render, picker opens, persistence works, Bases re-renders on change

---

## Verification Checklist

1. `npm run build` produces `main.js` with no errors
2. Copy `main.js`, `manifest.json`, `styles.css` to test vault's `.obsidian/plugins/powerbase/`
3. Enable plugin in Obsidian settings
4. Open a `.base` file → "Relational Table" appears in the view switcher
5. Table renders columns from `config.getOrder()` and rows from query results
6. Relation columns auto-detected (cells show wikilink chips)
7. Clicking a chip navigates to the linked note
8. Clicking "+" opens react-select picker with searchable note list
9. Selecting notes → click away → frontmatter updated → table re-renders
10. Creating a new note via the picker creates the file and adds the link
11. Edge cases: empty lists, single-item lists, broken links, long names, aliases

---

## Critical Files (in order of importance)

1. `src/relational-table-view.ts` — BasesView subclass, data transformation, React root
2. `src/components/editors/RelationEditor.tsx` — The core feature: react-select relation picker
3. `src/components/RelationalTable.tsx` — TanStack Table with column defs and cell dispatch
4. `src/services/EditEngineService.ts` — Debounced write queue for frontmatter persistence
5. `src/components/cells/RelationCell.tsx` — Wikilink chip rendering with dirtyCell toggle
6. `src/services/ParseService.ts` — Value type transformations and wikilink detection
