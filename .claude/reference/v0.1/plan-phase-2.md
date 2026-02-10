# Phase 2: Powerbase — Rollup Columns

## Summary

Add rollup columns to the Relational Table view. A rollup column reads a target property from every note linked via a relation column and aggregates the values (count, sum, average, min, max, list, unique list, percent true). Implemented as a read-only computed column with per-render-cycle caching. Configured via Bases view options.

---

## Key Architecture Decisions

| Decision | Chosen approach | Alternative (rejected) |
|---|---|---|
| Frontmatter access | **`app.metadataCache.getFileCache(file).frontmatter`** — synchronous, cached by Obsidian | `app.vault.read()` + parse YAML — async, slower, redundant |
| Cache scope | **Per-render-cycle Map** — rebuilt on each `onDataUpdated()`, discarded after render | WeakMap per file — stale data risk, complex invalidation |
| Aggregation location | **RollupService (pure functions)** — called from view before React render | Inside React component — causes render waterfalls, harder to cache |
| Rollup config storage | **View options** (`getViewOptions()`) — Bases persists config in `.base` file | Custom YAML section — non-standard, fragile |
| Multiple rollups | **Array of rollup configs** — each produces a virtual column | Single rollup only — too limiting |

---

## File Structure (changes from Phase 1)

```
src/
├── services/
│   ├── EditEngineService.ts          # (unchanged)
│   ├── ParseService.ts               # (unchanged)
│   ├── NoteSearchService.ts          # (unchanged)
│   └── RollupService.ts              # NEW — resolve links, read properties, aggregate
├── stores/
│   └── tableStore.ts                 # (unchanged)
├── components/
│   ├── RelationalTable.tsx           # MODIFIED — add rollup column defs
│   ├── cells/
│   │   ├── DefaultCell.tsx           # (unchanged)
│   │   ├── RelationCell.tsx          # (unchanged)
│   │   └── RollupCell.tsx            # NEW — display aggregated values
│   ├── editors/
│   │   └── RelationEditor.tsx        # (unchanged)
│   └── AppContext.tsx                # (unchanged)
├── relational-table-view.ts          # MODIFIED — compute rollups before render, pass to React
├── types.ts                          # MODIFIED — add RollupConfig, AggregationType, RollupColumnMeta
└── main.ts                           # (unchanged)
styles.css                             # MODIFIED — add rollup cell styles
```

---

## Type Additions

```typescript
// In types.ts

/** Supported aggregation functions */
export type AggregationType =
  | 'count'
  | 'count_values'
  | 'sum'
  | 'average'
  | 'min'
  | 'max'
  | 'list'
  | 'unique'
  | 'percent_true'
  | 'percent_not_empty';

/** Configuration for a single rollup column */
export interface RollupConfig {
  /** Unique ID for this rollup (e.g. "rollup_1") */
  id: string;
  /** User-facing display name for the column header */
  displayName: string;
  /** Property ID of the relation column to follow */
  relationPropertyId: string;
  /** Frontmatter key to read from each linked note */
  targetProperty: string;
  /** Aggregation function to apply */
  aggregation: AggregationType;
}

/** Extend ColumnMeta for rollup columns */
export interface RollupColumnMeta {
  propertyId: string;       // synthetic ID like "rollup_1"
  displayName: string;
  isRelation: false;
  isRollup: true;
  rollupConfig: RollupConfig;
}
```

---

## Implementation Steps

### Step 1: Extend types

Modify: `src/types.ts`

- Add `AggregationType` union type
- Add `RollupConfig` interface
- Add `isRollup` optional boolean to `ColumnMeta` (defaults to `false`/`undefined`)
- Add `rollupConfig` optional field to `ColumnMeta`

This keeps `ColumnMeta` as the single column type used throughout the table, with `isRelation` and `isRollup` as discriminators.

### Step 2: Build RollupService

Create: `src/services/RollupService.ts`

```typescript
export class RollupService {
  /**
   * Resolve all rollup values for every row.
   * Returns a Map<rowIndex, Map<rollupId, computedValue>>.
   *
   * Uses a per-call frontmatter cache (Map<filePath, Record<string,any>>)
   * to avoid reading the same file's metadata multiple times.
   */
  static computeRollups(
    app: App,
    rows: TableRowData[],
    rollupConfigs: RollupConfig[]
  ): Map<number, Map<string, any>>

  /**
   * Resolve relation links for a single cell.
   * Takes an array of raw wikilink strings → TFile[].
   * Uses NoteSearchService.resolveWikiLink() for each.
   */
  private static resolveLinks(
    app: App,
    rawLinks: unknown,
    sourcePath: string
  ): TFile[]

  /**
   * Read a property from a file's frontmatter via metadataCache.
   * Returns the raw value or null if not found.
   */
  private static readProperty(
    app: App,
    file: TFile,
    propertyName: string,
    cache: Map<string, Record<string, any>>
  ): any

  /**
   * Apply an aggregation function to an array of values.
   * Returns the aggregated result.
   */
  static aggregate(
    values: any[],
    aggregation: AggregationType
  ): any
}
```

**Aggregation function behaviors:**

| Function | Input | Output | Null handling |
|---|---|---|---|
| `count` | any[] | number | Counts all linked notes (incl. null values) |
| `count_values` | any[] | number | Counts non-null values only |
| `sum` | number[] | number | Skips non-numeric, returns 0 if none |
| `average` | number[] | number | Skips non-numeric, returns 0 if none |
| `min` | number[] | number | Skips non-numeric, returns null if none |
| `max` | number[] | number | Skips non-numeric, returns null if none |
| `list` | any[] | string | Comma-separated, skips null |
| `unique` | any[] | string | Unique values, comma-separated |
| `percent_true` | boolean[] | string | "(N/M) X%" format |
| `percent_not_empty` | any[] | string | "(N/M) X%" format |

**Cache strategy:**
```typescript
// Built once per computeRollups() call, discarded after
const fmCache = new Map<string, Record<string, any>>();

function readProperty(app, file, key, fmCache) {
  if (!fmCache.has(file.path)) {
    const cache = app.metadataCache.getFileCache(file);
    fmCache.set(file.path, cache?.frontmatter ?? {});
  }
  return fmCache.get(file.path)![key] ?? null;
}
```

### Step 3: Build RollupCell

Create: `src/components/cells/RollupCell.tsx`

Read-only cell that displays the pre-computed rollup value.

```tsx
export function RollupCell({ getValue }: CellContext<TableRowData, unknown>) {
  const value = getValue();

  if (value === null || value === undefined) {
    return <span className="cell-empty" />;
  }

  // Numeric values
  if (typeof value === 'number') {
    return (
      <span className="rollup-cell rollup-numeric">
        {Number.isInteger(value) ? value : value.toFixed(2)}
      </span>
    );
  }

  // Percentage strings "(3/5) 60%"
  if (typeof value === 'string' && value.includes('%')) {
    return <span className="rollup-cell rollup-percent">{value}</span>;
  }

  // List/unique strings
  return (
    <span className="rollup-cell rollup-list" title={String(value)}>
      {String(value)}
    </span>
  );
}
```

### Step 4: Modify RelationalTable to support rollup columns

Modify: `src/components/RelationalTable.tsx`

In the column definition builder:
```typescript
columns.map((col) =>
  columnHelper.accessor(
    (row) => row[col.propertyId],
    {
      id: col.propertyId,
      header: () => (
        <span>
          {col.displayName}
          {col.isRollup && <span className="rollup-indicator">Σ</span>}
          {sort && <span className="sort-indicator">...</span>}
        </span>
      ),
      cell: col.isRollup
        ? RollupCell
        : col.isRelation
          ? RelationCell
          : DefaultCell,
    }
  )
)
```

### Step 5: Compute rollups in the view and inject into row data

Modify: `src/relational-table-view.ts` → `renderTable()`

After building `rows` and `columns`:

```typescript
// Parse rollup configs from view options
const rollupConfigs = this.getRollupConfigs();

if (rollupConfigs.length > 0) {
  // Compute rollup values for all rows
  const { RollupService } = require('./services/RollupService');
  const rollupResults = RollupService.computeRollups(this.app, rows, rollupConfigs);

  // Inject computed values into row data
  for (const [rowIdx, rollupValues] of rollupResults) {
    for (const [rollupId, value] of rollupValues) {
      rows[rowIdx][rollupId] = value;
    }
  }

  // Add rollup columns to column list
  for (const rc of rollupConfigs) {
    columns.push({
      propertyId: rc.id,
      displayName: rc.displayName,
      isRelation: false,
      isRollup: true,
      rollupConfig: rc,
    });
  }
}
```

### Step 6: View options for rollup configuration

Modify: `src/relational-table-view.ts` → `getViewOptions()`

Add rollup configuration options. The Bases view options API supports dropdowns and text inputs:

```typescript
static getViewOptions(): any[] {
  return [
    // Existing relation detection option
    {
      type: 'dropdown',
      key: 'relationDetection',
      displayName: 'Relation Detection',
      default: 'auto',
      options: {
        'auto': 'Auto-detect (list of wikilinks)',
        'manual': 'Select property',
      },
    },
    // Rollup count (0-5)
    {
      type: 'dropdown',
      key: 'rollupCount',
      displayName: 'Number of Rollups',
      default: '0',
      options: {
        '0': 'None',
        '1': '1 rollup column',
        '2': '2 rollup columns',
        '3': '3 rollup columns',
      },
    },
    // Rollup 1 config — relation column
    {
      type: 'text',
      key: 'rollup1_relation',
      displayName: 'Rollup 1: Relation Property',
      default: '',
    },
    // Rollup 1 config — target property
    {
      type: 'text',
      key: 'rollup1_target',
      displayName: 'Rollup 1: Target Property',
      default: '',
    },
    // Rollup 1 config — aggregation
    {
      type: 'dropdown',
      key: 'rollup1_aggregation',
      displayName: 'Rollup 1: Aggregation',
      default: 'count',
      options: {
        'count': 'Count (all links)',
        'count_values': 'Count Values (non-empty)',
        'sum': 'Sum',
        'average': 'Average',
        'min': 'Min',
        'max': 'Max',
        'list': 'List (all values)',
        'unique': 'Unique (deduplicated)',
        'percent_true': 'Percent True',
        'percent_not_empty': 'Percent Not Empty',
      },
    },
    // Rollup 1 config — display name
    {
      type: 'text',
      key: 'rollup1_name',
      displayName: 'Rollup 1: Column Name',
      default: 'Rollup 1',
    },
    // ... repeat for rollup 2, rollup 3
  ];
}
```

Add a helper to parse view option values into `RollupConfig[]`:

```typescript
private getRollupConfigs(): RollupConfig[] {
  const count = parseInt(this.config.getOptionValue('rollupCount') || '0', 10);
  const configs: RollupConfig[] = [];

  for (let i = 1; i <= count; i++) {
    const relation = this.config.getOptionValue(`rollup${i}_relation`);
    const target = this.config.getOptionValue(`rollup${i}_target`);
    const aggregation = this.config.getOptionValue(`rollup${i}_aggregation`) || 'count';
    const name = this.config.getOptionValue(`rollup${i}_name`) || `Rollup ${i}`;

    if (relation && target) {
      configs.push({
        id: `rollup_${i}`,
        displayName: name,
        relationPropertyId: relation,
        targetProperty: target,
        aggregation: aggregation as AggregationType,
      });
    }
  }

  return configs;
}
```

### Step 7: Styles

Add to `styles.css`:

```css
/* Rollup cells */
.rollup-cell {
  font-variant-numeric: tabular-nums;
}

.rollup-numeric {
  font-weight: var(--font-medium);
}

.rollup-percent {
  color: var(--text-muted);
}

.rollup-list {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 250px;
  display: inline-block;
}

/* Rollup header indicator */
.rollup-indicator {
  margin-left: 4px;
  color: var(--text-faint);
  font-size: var(--font-smallest);
  opacity: 0.6;
}
```

### Step 8: Wire and test

- Import `RollupCell` in `RelationalTable.tsx`
- Import `RollupService` in `relational-table-view.ts`
- Verify build: `npm run build`
- Test with a vault:
  1. Create a base with a relation column (e.g. "Tasks" linking to task notes)
  2. Each task note has a numeric property (e.g. "hours") and boolean (e.g. "done")
  3. Switch to Relational Table view
  4. Set rollup count to 1
  5. Configure: relation = the relation property, target = "hours", aggregation = "sum"
  6. Verify the rollup column appears with correct aggregated values

---

## Verification Checklist

1. `npm run build` produces `main.js` with no errors
2. Rollup count option appears in view settings
3. Setting rollup count to 1+ reveals rollup config options
4. Rollup column appears in the table with "Σ" header indicator
5. `count` aggregation returns the number of linked notes
6. `sum` aggregation correctly sums numeric values from linked notes
7. `average` returns correct mean value
8. `min`/`max` return correct extremes
9. `list` shows comma-separated values from linked notes
10. `unique` deduplicates the list
11. `percent_true` shows "(N/M) X%" for boolean properties
12. `percent_not_empty` shows "(N/M) X%" for any properties
13. Broken links (non-existent notes) are handled gracefully (skipped, not errors)
14. Notes without the target property show null contribution
15. Empty relation cells produce correct zero/empty rollup values
16. Changing the relation triggers re-render with updated rollup values
17. Multiple rollup columns work simultaneously
18. Performance: 100 rows × 10 links each resolves without visible lag

---

## Critical Files (in order of importance)

1. `src/services/RollupService.ts` — Core logic: link resolution, property reading, aggregation
2. `src/relational-table-view.ts` — Computes rollups before render, parses view option config
3. `src/components/cells/RollupCell.tsx` — Display component for aggregated values
4. `src/components/RelationalTable.tsx` — Column def dispatch to RollupCell
5. `src/types.ts` — AggregationType, RollupConfig type definitions
6. `styles.css` — Rollup cell styling
