# Phase 3: Powerbase — Bidirectional Relations + Polish

## Summary

Add bidirectional relation sync (adding `[[B]]` to note A auto-adds `[[A]]` to note B), inline cell editing for non-relation columns, column resizing, grouping support, summary rows, and full keyboard navigation. This phase turns the MVP into a polished, feature-complete table editor.

---

## Key Architecture Decisions

| Decision | Chosen approach | Alternative (rejected) |
|---|---|---|
| Bidi sync trigger | **Post-persist callback from EditEngineService** — runs after primary edit succeeds | Inline in RelationEditor — couples UI to sync logic |
| Bidi conflict resolution | **Last-write-wins, append-only** — never remove a back-link that wasn't in the original diff | Full bidirectional diff — complex, race-prone, user-confusing |
| Bidi target property | **Same property name as source** — if source is "related", target is "related" | Configurable target property — over-engineered for v0.1 |
| Column resizing | **TanStack Table `getResizeHandler()`** + CSS `width` on `<th>`/`<td>` | Custom drag implementation — unnecessary, TanStack handles it |
| Inline editing | **EditableCell component** with display/edit mode toggle (same dirtyCell pattern as RelationCell) | Contenteditable divs — accessibility issues, inconsistent behavior |
| Grouping data | **`BasesQueryResult.groupedData`** when available, fallback to flat rendering | Custom grouping logic — redundant, Bases already computes it |
| Summary values | **`BasesQueryResult.getSummaryValue(propertyId)`** per column | Custom aggregation — redundant, Bases already computes it |
| Keyboard nav state | **Zustand store** (`focusedCell: {row, col}`) — global, reactive | Local React state — scattered, hard to coordinate across cells |

---

## File Structure (changes from Phase 2)

```
src/
├── services/
│   ├── EditEngineService.ts          # MODIFIED — add post-persist callback hook
│   ├── ParseService.ts               # (unchanged)
│   ├── NoteSearchService.ts          # (unchanged)
│   ├── RollupService.ts              # (unchanged)
│   └── BidirectionalSyncService.ts   # NEW — back-link management
├── stores/
│   └── tableStore.ts                 # MODIFIED — add focusedCell, columnSizing state
├── components/
│   ├── RelationalTable.tsx           # MODIFIED — resizing, grouping, summary, keyboard nav
│   ├── cells/
│   │   ├── DefaultCell.tsx           # (removed — replaced by EditableCell)
│   │   ├── EditableCell.tsx          # NEW — replaces DefaultCell with edit support
│   │   ├── RelationCell.tsx          # MODIFIED — keyboard nav integration
│   │   └── RollupCell.tsx            # (unchanged)
│   ├── editors/
│   │   ├── RelationEditor.tsx        # (unchanged)
│   │   ├── TextEditor.tsx            # NEW — inline text/number input
│   │   └── CheckboxEditor.tsx        # NEW — inline checkbox toggle
│   └── AppContext.tsx                # (unchanged)
├── relational-table-view.ts          # MODIFIED — pass groupedData, summaryValues, bidi config
├── types.ts                          # MODIFIED — add GroupData, FocusedCell, EditableCellType
└── main.ts                           # MODIFIED — register event listeners for rename/delete
styles.css                             # MODIFIED — resize handles, group headers, summary row, focus ring
```

---

## Type Additions

```typescript
// In types.ts

/** Focused cell coordinates for keyboard navigation */
export interface FocusedCell {
  rowIndex: number;
  colIndex: number;
}

/** Grouped data from Bases */
export interface GroupData {
  groupKey: string;
  groupValue: any;
  rows: TableRowData[];
}

/** Cell value types that support inline editing */
export type EditableCellType = 'text' | 'number' | 'checkbox' | 'date' | 'readonly';

/** Extended EditArgs with optional post-persist callback */
export interface EditArgsWithCallback extends EditArgs {
  onPersisted?: () => void;
}
```

---

## Implementation Steps

### Step 1: Bidirectional Sync Service

Create: `src/services/BidirectionalSyncService.ts`

```typescript
export class BidirectionalSyncService {
  /**
   * After a relation cell is edited, sync back-links to target notes.
   *
   * @param app - Obsidian App
   * @param sourceFile - The note whose relation was edited
   * @param propertyName - The frontmatter property (e.g. "related")
   * @param oldLinks - Previous wikilink strings
   * @param newLinks - Updated wikilink strings
   */
  static syncBackLinks(
    app: App,
    sourceFile: TFile,
    propertyName: string,
    oldLinks: string[],
    newLinks: string[]
  ): void

  /**
   * Compute diff: which links were added, which removed.
   */
  private static diffLinks(
    oldLinks: string[],
    newLinks: string[]
  ): { added: string[]; removed: string[] }

  /**
   * Add a back-link to a target note's property.
   * If the property doesn't exist, creates it as a list.
   * If the back-link already exists, no-op.
   */
  private static addBackLink(
    app: App,
    targetFile: TFile,
    propertyName: string,
    backLink: string
  ): void

  /**
   * Remove a back-link from a target note's property.
   * If the link doesn't exist, no-op.
   */
  private static removeBackLink(
    app: App,
    targetFile: TFile,
    propertyName: string,
    backLink: string
  ): void
}
```

**Sync flow:**
1. Relation editor commits new links → `handleUpdateRelation()` called
2. Diff old vs new links → determine `added` and `removed`
3. For each added link:
   - Resolve path to TFile
   - Read target note's frontmatter for `propertyName`
   - If property doesn't exist → set to `["[[SourceNote]]"]`
   - If property exists and is array → append `"[[SourceNote]]"` if not already present
4. For each removed link:
   - Resolve path to TFile
   - Read target note's frontmatter for `propertyName`
   - Filter out `"[[SourceNote]]"` from the array
5. All writes go through `EditEngineService` for debouncing

**Edge cases:**
- Target note doesn't exist → skip (user may have typed a future note name)
- Target property is not a list → don't modify (could be a different property type)
- Source note is in the target's list with a different path format → normalize paths before comparing
- Circular reference (A→B, B→A) → handled naturally, both notes get links

### Step 2: Wire bidi sync into the relation update flow

Modify: `src/relational-table-view.ts` → `handleUpdateRelation()`

```typescript
private async handleUpdateRelation(
  file: TFile,
  propertyId: string,
  newLinks: string[]
): Promise<void> {
  const { EditEngineService } = require('./services/EditEngineService');
  const { BidirectionalSyncService } = require('./services/BidirectionalSyncService');
  const { ParseService } = require('./services/ParseService');

  const propertyName = this.extractPropertyName(propertyId);

  // Read old links before overwriting
  const oldEntry = this.data?.data?.find(
    (e: BasesEntry) => e.file.path === file.path
  );
  const oldRaw = oldEntry ? this.unwrapValue(oldEntry.getValue(propertyId as BasesPropertyId)) : [];
  const oldLinks = Array.isArray(oldRaw) ? oldRaw.filter((v: any) => typeof v === 'string') : [];

  // Persist the primary edit
  EditEngineService.getInstance(this.app).updateRowFile({
    file,
    propertyName,
    value: newLinks,
  });

  // Sync back-links (async, non-blocking)
  BidirectionalSyncService.syncBackLinks(
    this.app,
    file,
    propertyName,
    oldLinks,
    newLinks
  );
}
```

### Step 3: Handle note renames and deletions

Modify: `src/main.ts`

Register vault event listeners to maintain link integrity:

```typescript
async onload() {
  // Existing registerBasesView...

  // Listen for file renames to update wikilinks in relation properties
  this.registerEvent(
    this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile && file.extension === 'md') {
        // Obsidian's built-in link updater handles most cases.
        // This is a safety net for edge cases where frontmatter
        // list properties don't get updated automatically.
        this.handleFileRenamed(file, oldPath);
      }
    })
  );

  // Listen for file deletions to clean up dangling back-links
  this.registerEvent(
    this.app.vault.on('delete', (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        // No-op for now: dangling links are harmless and
        // self-heal when the user next edits the relation.
        // Full cleanup deferred to avoid expensive vault scans.
      }
    })
  );
}

private async handleFileRenamed(file: TFile, oldPath: string): Promise<void> {
  // Obsidian handles link updates in note body content,
  // but frontmatter list properties may not be updated.
  // Scan all files that had a link to oldPath in frontmatter lists
  // and update them to the new path.
  // This runs on a 1-second debounce to avoid conflicts with Obsidian's
  // own link updater.
}
```

### Step 4: EditableCell — inline editing for non-relation columns

Create: `src/components/cells/EditableCell.tsx`

Replaces `DefaultCell`. Shows read-only by default, enters edit mode on double-click or Enter.

```tsx
export function EditableCell({
  getValue,
  row,
  column,
  table,
}: CellContext<TableRowData, unknown>) {
  const [editing, setEditing] = useState(false);
  const value = getValue();

  // Determine cell type from value
  const cellType: EditableCellType =
    typeof value === 'boolean' ? 'checkbox'
    : typeof value === 'number' ? 'number'
    : 'text';

  const handleSave = useCallback((newValue: any) => {
    setEditing(false);
    table.options.meta?.updateCell(row.index, column.id, newValue);
  }, [table, row.index, column.id]);

  // Keyboard navigation integration
  const isFocused = table.options.meta?.isCellFocused(row.index, column.id);

  if (editing) {
    switch (cellType) {
      case 'checkbox':
        return <CheckboxEditor value={value} onSave={handleSave} />;
      case 'number':
      case 'text':
        return <TextEditor value={value} type={cellType} onSave={handleSave} onCancel={() => setEditing(false)} />;
    }
  }

  // Display mode (same rendering as old DefaultCell)
  if (value === null || value === undefined) {
    return <span className="cell-empty" />;
  }

  if (typeof value === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={value}
        className="cell-checkbox"
        onChange={(e) => {
          table.options.meta?.updateCell(row.index, column.id, e.target.checked);
        }}
      />
    );
  }

  if (Array.isArray(value)) {
    return (
      <span className="cell-list">
        {value.map((v, i) => (
          <span key={i} className="cell-list-item">
            {String(v)}{i < value.length - 1 ? ', ' : ''}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span
      className={`cell-text ${isFocused ? 'cell-focused' : ''}`}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true); }}
      tabIndex={0}
    >
      {String(value)}
    </span>
  );
}
```

### Step 5: TextEditor — inline text/number input

Create: `src/components/editors/TextEditor.tsx`

```tsx
export function TextEditor({
  value,
  type,
  onSave,
  onCancel,
}: {
  value: any;
  type: 'text' | 'number';
  onSave: (newValue: any) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const parsed = type === 'number' ? parseFloat(draft) : draft;
      onSave(type === 'number' && isNaN(parsed as number) ? null : parsed);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      className="cell-inline-editor"
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        const parsed = type === 'number' ? parseFloat(draft) : draft;
        onSave(type === 'number' && isNaN(parsed as number) ? null : parsed);
      }}
    />
  );
}
```

### Step 6: CheckboxEditor — inline checkbox toggle

Create: `src/components/editors/CheckboxEditor.tsx`

Checkboxes don't need an editor — they toggle immediately:

```tsx
// Checkbox toggling is handled directly in EditableCell's onChange handler.
// This file exists only if we need more complex boolean editing later.
// For now, the checkbox in EditableCell handles it.
```

Actually, checkbox toggling is simple enough to handle inline in `EditableCell`. No separate editor needed — the `onChange` handler directly calls `updateCell`.

### Step 7: Extend TableMeta and store for cell editing + keyboard nav

Modify: `src/components/RelationalTable.tsx` — extend `TableMeta`:

```typescript
declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    updateRelation: (rowIndex: number, columnId: string, newLinks: string[]) => void;
    updateCell: (rowIndex: number, columnId: string, value: any) => void;
    isCellFocused: (rowIndex: number, columnId: string) => boolean;
    focusedCell: FocusedCell | null;
    setFocusedCell: (cell: FocusedCell | null) => void;
  }
}
```

Modify: `src/stores/tableStore.ts` — add focus and sizing:

```typescript
interface TableState {
  rows: TableRowData[];
  columns: ColumnMeta[];
  focusedCell: FocusedCell | null;
  columnSizing: Record<string, number>;

  setData: (rows: TableRowData[], columns: ColumnMeta[]) => void;
  updateCell: (rowIndex: number, propertyId: string, value: any) => void;
  setFocusedCell: (cell: FocusedCell | null) => void;
  setColumnSize: (columnId: string, width: number) => void;
}
```

### Step 8: Column resizing

Modify: `src/components/RelationalTable.tsx`

Enable TanStack Table's built-in column resizing:

```typescript
const table = useReactTable({
  data: rows,
  columns: columnDefs,
  getCoreRowModel: getCoreRowModel(),
  manualSorting: true,
  columnResizeMode: 'onChange',
  meta: { ... },
});
```

Add resize handle to header cells:

```tsx
<th
  key={header.id}
  style={{ width: header.getSize() }}
>
  {/* Header content */}
  <div
    onMouseDown={header.getResizeHandler()}
    onTouchStart={header.getResizeHandler()}
    className={`resize-handle ${header.column.getIsResizing() ? 'resizing' : ''}`}
  />
</th>
```

### Step 9: Grouping support

Modify: `src/relational-table-view.ts` → `renderTable()`

When `BasesQueryResult` provides grouped data:

```typescript
// Check if data is grouped
const groupedData = data.groupedData;

if (groupedData && groupedData.length > 0) {
  // Transform grouped data into GroupData[]
  const groups: GroupData[] = groupedData.map((group: any) => ({
    groupKey: group.key,
    groupValue: this.unwrapValue(group.value),
    rows: group.entries.map((entry: BasesEntry) => {
      const row: TableRowData = { file: entry.file };
      for (const propId of orderedProperties) {
        row[propId as string] = this.unwrapValue(entry.getValue(propId));
      }
      return row;
    }),
  }));

  // Pass groups to React component
  // RelationalTable handles rendering group headers + rows
}
```

Modify: `src/components/RelationalTable.tsx`

Add group rendering:

```tsx
{groups ? (
  groups.map((group) => (
    <React.Fragment key={group.groupKey}>
      <tr className="group-header-row">
        <td colSpan={columns.length} className="group-header">
          <span className="group-toggle">▾</span>
          <span className="group-value">{String(group.groupValue)}</span>
          <span className="group-count">({group.rows.length})</span>
        </td>
      </tr>
      {/* Render rows for this group */}
    </React.Fragment>
  ))
) : (
  /* Flat rendering as before */
)}
```

### Step 10: Summary row

Modify: `src/relational-table-view.ts` → `renderTable()`

Read summary values from Bases:

```typescript
// Build summary data
const summaryValues: Record<string, any> = {};
for (const propId of orderedProperties) {
  try {
    const summaryVal = data.getSummaryValue(propId);
    summaryValues[propId as string] = this.unwrapValue(summaryVal);
  } catch {
    summaryValues[propId as string] = null;
  }
}
```

Modify: `src/components/RelationalTable.tsx`

Add `<tfoot>` summary row:

```tsx
{summaryValues && (
  <tfoot>
    <tr className="summary-row">
      {table.getHeaderGroups()[0]?.headers.map((header) => (
        <td key={header.id} className="summary-cell">
          {summaryValues[header.id] != null
            ? String(summaryValues[header.id])
            : ''}
        </td>
      ))}
    </tr>
  </tfoot>
)}
```

### Step 11: Keyboard navigation

Add keyboard event handler to the table container:

```tsx
const handleTableKeyDown = useCallback((e: React.KeyboardEvent) => {
  if (!focusedCell) return;
  const { rowIndex, colIndex } = focusedCell;
  const maxRow = rows.length - 1;
  const maxCol = columns.length - 1;

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault();
      if (rowIndex > 0) setFocusedCell({ rowIndex: rowIndex - 1, colIndex });
      break;
    case 'ArrowDown':
      e.preventDefault();
      if (rowIndex < maxRow) setFocusedCell({ rowIndex: rowIndex + 1, colIndex });
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (colIndex > 0) setFocusedCell({ rowIndex, colIndex: colIndex - 1 });
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (colIndex < maxCol) setFocusedCell({ rowIndex, colIndex: colIndex + 1 });
      break;
    case 'Tab':
      e.preventDefault();
      if (e.shiftKey) {
        // Move left, wrap to previous row
        if (colIndex > 0) setFocusedCell({ rowIndex, colIndex: colIndex - 1 });
        else if (rowIndex > 0) setFocusedCell({ rowIndex: rowIndex - 1, colIndex: maxCol });
      } else {
        // Move right, wrap to next row
        if (colIndex < maxCol) setFocusedCell({ rowIndex, colIndex: colIndex + 1 });
        else if (rowIndex < maxRow) setFocusedCell({ rowIndex: rowIndex + 1, colIndex: 0 });
      }
      break;
    case 'Escape':
      setFocusedCell(null);
      break;
  }
}, [focusedCell, rows.length, columns.length]);
```

Cells receive `isFocused` from table meta and render a focus ring via CSS class.

### Step 12: Styles

Add to `styles.css`:

```css
/* Column resize handle */
.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  width: 4px;
  cursor: col-resize;
  user-select: none;
  touch-action: none;
}

.resize-handle:hover,
.resize-handle.resizing {
  background-color: var(--interactive-accent);
  opacity: 0.5;
}

/* Make th position relative for resize handle */
.relational-table thead th {
  position: relative;
}

/* Inline cell editor */
.cell-inline-editor {
  width: 100%;
  padding: 2px 4px;
  border: 1px solid var(--interactive-accent);
  border-radius: 4px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: inherit;
  font-family: inherit;
  outline: none;
}

/* Cell focus ring (keyboard nav) */
.cell-focused {
  outline: 2px solid var(--interactive-accent);
  outline-offset: -2px;
  border-radius: 2px;
}

/* Group header row */
.group-header-row td {
  background-color: var(--background-secondary);
  padding: 4px 12px;
  font-weight: var(--font-semibold);
  border-bottom: 1px solid var(--background-modifier-border);
}

.group-toggle {
  margin-right: 6px;
  cursor: pointer;
  user-select: none;
}

.group-value {
  color: var(--text-normal);
}

.group-count {
  margin-left: 8px;
  color: var(--text-faint);
  font-weight: normal;
  font-size: var(--font-smallest);
}

/* Summary row */
.summary-row td {
  border-top: 2px solid var(--background-modifier-border);
  padding: 6px 12px;
  font-weight: var(--font-semibold);
  color: var(--text-muted);
  background-color: var(--background-secondary);
  position: sticky;
  bottom: 0;
}

/* Checkbox editing (not disabled) */
.cell-checkbox-editable {
  pointer-events: auto;
  cursor: pointer;
}
```

---

## Verification Checklist

### Bidirectional Relations
1. Add `[[NoteB]]` to NoteA's relation → NoteB's frontmatter gains `[[NoteA]]` in the same property
2. Remove `[[NoteB]]` from NoteA → NoteB's frontmatter loses `[[NoteA]]`
3. Bidi sync works when target note has no existing property (creates the list)
4. Bidi sync works when target note already has other links (appends, doesn't overwrite)
5. No duplicate links created if back-link already exists
6. Circular relations (A↔B) don't cause infinite loops
7. Renaming a note updates wikilinks in related notes' frontmatter

### Inline Editing
8. Double-click text cell → inline editor appears, focused and selected
9. Type new value + Enter → value saved to frontmatter, table re-renders
10. Escape cancels editing, restores original value
11. Click away from editor → value saved (blur-to-save)
12. Checkbox cells toggle on single click (no double-click needed)
13. Number cells validate input (NaN → null)
14. Array/list cells remain read-only (no inline editing for complex types)

### Column Resizing
15. Drag header border → column width changes in real-time
16. Column widths persist across re-renders (stored in table state)
17. Minimum column width prevents collapse to zero

### Grouping
18. Grouped base data renders with group headers
19. Group headers show group value and row count
20. Groups are collapsible (click toggle)
21. Ungrouped data renders normally (flat)

### Summary Row
22. Summary row appears at bottom with Bases-computed summaries
23. Summary row is sticky (stays visible when scrolling)
24. Columns without summaries show empty cell

### Keyboard Navigation
25. Click a cell → cell receives focus ring
26. Arrow keys move focus between cells
27. Tab moves right (wraps to next row), Shift+Tab moves left (wraps to previous)
28. Enter on a focused cell starts editing
29. Escape unfocuses the cell
30. Focus ring clearly visible in both light and dark themes

---

## Critical Files (in order of importance)

1. `src/services/BidirectionalSyncService.ts` — Core bidi logic: diff, add/remove back-links
2. `src/components/cells/EditableCell.tsx` — Inline editing for all non-relation columns
3. `src/components/RelationalTable.tsx` — Resizing, grouping, summary, keyboard nav integration
4. `src/components/editors/TextEditor.tsx` — Inline text/number editor component
5. `src/relational-table-view.ts` — Group data transformation, summary extraction, bidi wiring
6. `src/stores/tableStore.ts` — Focus state, column sizing state
7. `src/main.ts` — Vault event listeners for rename/delete
8. `styles.css` — Resize handles, focus rings, group headers, summary row
