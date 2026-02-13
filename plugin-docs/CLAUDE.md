<!-- Powerbase docs v0.1 -->
# Powerbase — Plugin Reference

Obsidian plugin that extends **Bases** (v1.10.0+) with relation columns, rollup aggregations, bidirectional sync, quick actions, group-by, date/datetime editing, and priority-enhanced UI — all configured in `.base` files.

**GitHub**: https://github.com/ran-codes/obsidian-powerbase — the `main` branch is the source of truth for plugin behavior. If this doc doesn't cover what you need (edge cases, internal logic, undocumented behavior), examine the repository directly.

## What This Plugin Adds (vs Vanilla Bases)

- **Relation columns** — auto-detected via folder matching, rendered as clickable wikilink chips with a folder-filtered picker
- **Rollup columns** — aggregate values from linked notes (count, sum, average, min, max, list, unique, percent_true, percent_not_empty, count_values)
- **Bidirectional sync** — editing a relation on note A automatically writes a back-link on note B
- **Quick actions** — one-click buttons that set frontmatter properties (e.g. mark done, archive)
- **Group-by** — rows grouped by any property, with collapsible headers
- **Date/datetime columns** — calendar icon, MM/DD/YYYY display, custom calendar popup with month navigation, today/clear buttons
- **Priority enhanced UI** — auto-detected `priority` columns rendered as color-coded chips, toggleable via column context menu
- **List/tags chip editing** — inline chip editor with type-ahead suggestions dropdown, backspace to remove last chip
- **Column context menu** — right-click any column header to hide, sort, view property type, toggle enhanced UI
- **File context menu** — right-click file names for open/rename/copy/delete actions
- **Inline editing** — edit text, number, checkbox, date, and list properties directly in cells

## View Setup

In any `.base` file, add a view with `type: relational-table`:

```yaml
filter:
  conjunction: and
  conditions:
    - field: file.folder
      operator: is
      value: tasks
    - field: file.ext
      operator: is
      value: md
views:
  - name: My Relational View
    type: relational-table
    order:
      - file.name
      - note.project
      - note.priority
      - note.done
      - note.tags
    groupBy: note.priority
```

## Property ID Conventions

All property references use dot notation:
- `note.property-name` — frontmatter property (e.g. `note.project`, `note.tags`)
- `file.name` — file basename
- `file.folder` — file folder path
- `file.ext` — file extension

In rollup `targetProperty` and bidi `reverseProperty`, use the **bare property name** (no `note.` prefix): e.g. `hours`, `tasks`.

## Configuration

**CRITICAL: Config keys are view-level flat keys, NOT nested inside `options:`.**

`this.config.get(key)` reads from flat keys that are siblings of `order`, `sort`, `groupBy` on the view object. The `options:` block is only used to define the Configure view panel structure — values placed inside `options:` are **silently ignored** at runtime.

Correct:
```yaml
views:
  - type: relational-table
    name: My View
    order: [file.name, note.project]
    rollupCount: "1"
    rollup1_relation: note.project
    rollup1_target: hours
    rollup1_aggregation: sum
    rollup1_name: Total Hours
```

**Wrong** (will not work):
```yaml
views:
  - type: relational-table
    name: My View
    order: [file.name, note.project]
    options:
      rollupCount: "1"           # NOT read by this.config.get()
      rollup1_relation: note.project
```

**All config keys** (view-level flat):

| Key pattern | Purpose |
|-------------|---------|
| `rollupCount` | Number of rollups (0–3) |
| `rollupN_relation` | Relation column property ID for rollup N |
| `rollupN_target` | Bare property name to aggregate for rollup N |
| `rollupN_aggregation` | Aggregation function for rollup N |
| `rollupN_name` | Display name for rollup N column |
| `bidiCount` | Number of bidi syncs (0–3) |
| `bidiN_column` | Relation column property ID for bidi sync N |
| `bidiN_reverse` | Bare property name to write back-links to |
| `quickActions` | Quick actions DSL string |
| `relationDetection` | `auto` (default) or `manual` |
| `colType_{propId}` | Persisted column type cache (auto-set) |
| `priorityEnhanced_{propId}` | `true`/`false` — toggle priority UI (default: true) |
| `relationEnhanced_{propId}` | `true`/`false` — toggle relation chip UI (default: true) |

## Feature Reference

### Relation Columns

Auto-detected via **folder matching only**: the property name must match a subfolder under the base folder.

Detection logic (`detectRelationColumn()`):
1. Property must start with `note.` prefix
2. Property name (stripped of prefix) is checked against subfolders: `<baseFolder>/<name>/`, `<baseFolder>/<name>s/`, or if name ends with `s`, `<baseFolder>/<name-without-s>/`
3. If a matching folder exists in the vault, the column is a relation

**Example**: Property `note.project` → checks for `<baseFolder>/project/` or `<baseFolder>/projects/`. If either exists as a folder, it's a relation.

**Base folder**: Derived from entries' common parent folder, then one level up to include sibling folders. E.g. if entries are in `my-project/tasks/`, base folder is `my-project/`.

**Folder filtering**: The relation picker auto-filters by the matched subfolder. Falls back to the base folder if no subfolder match.

**Enhanced UI toggle**: Relation columns show wikilink chips by default. Disable per-column via `relationEnhanced_{propId}: "false"` or right-click column header → Enhanced UI.

### Rollup Columns

Aggregate data from notes linked via a relation column. Configure up to 3 rollups.

```yaml
views:
  - type: relational-table
    order: [file.name, note.project, note.hours]
    rollupCount: "2"
    rollup1_relation: note.project
    rollup1_target: hours
    rollup1_aggregation: sum
    rollup1_name: Total Hours
    rollup2_relation: note.project
    rollup2_target: status
    rollup2_aggregation: count_values
    rollup2_name: Active Projects
```

**Config keys** (per rollup, where N = 1–3):

| Key | Description |
|-----|-------------|
| `rollupN_relation` | Property ID of the relation column to follow (e.g. `note.project`) |
| `rollupN_target` | Bare property name to read from each linked note (e.g. `hours`) |
| `rollupN_aggregation` | Aggregation function (see below) |
| `rollupN_name` | Display name for the column header |

**Aggregation types**:

| Value | Description |
|-------|-------------|
| `count` | Count all links |
| `count_values` | Count non-empty values |
| `sum` | Sum numeric values |
| `average` | Average numeric values |
| `min` | Minimum value |
| `max` | Maximum value |
| `list` | All values as comma-separated list |
| `unique` | Deduplicated values |
| `percent_true` | Percentage of boolean true values — format: `(N/total) X%` |
| `percent_not_empty` | Percentage of non-empty values — format: `(N/total) X%` |

**Link resolution**: Rollups resolve both wikilinks (`[[Note]]`) and plain text references (matching basenames/aliases).

### Bidirectional Sync

When a user adds/removes a link in a relation column, the plugin writes a corresponding back-link on the target note. Configure up to 3 bidi syncs.

```yaml
views:
  - type: relational-table
    order: [file.name, note.project]
    bidiCount: "1"
    bidi1_column: note.project
    bidi1_reverse: tasks
```

**Config keys** (per sync, where N = 1–3):

| Key | Description |
|-----|-------------|
| `bidiN_column` | Property ID of the relation column to watch (e.g. `note.project`) |
| `bidiN_reverse` | Bare property name to write on the linked note (e.g. `tasks`) |

**Example**: If `task-1.md` has `project: [[Project Alpha]]`, bidi sync writes `tasks: ["[[task-1]]"]` into `Project Alpha.md`'s frontmatter.

**Mechanism**: Uses `processFrontMatter()` for atomic read+write to avoid race conditions when multiple back-links target the same file. Diffs old vs new links to only add/remove what changed.

### Quick Actions

One-click buttons that set frontmatter properties. Configured via a DSL string.

```yaml
views:
  - type: relational-table
    order: [file.name, note.status]
    quickActions: "Done:status=done,completed=TODAY;Archive:archived=TRUE"
```

**DSL syntax**: `label:prop=value,prop=value;label:prop=value`
- Actions separated by `;`
- Each action: `Label:property=value,property=value`
- Property names are bare frontmatter keys (no `note.` prefix)

**Special value tokens** (case-insensitive):

| Token | Resolves to |
|-------|-------------|
| `TODAY` | Current date as `YYYY-MM-DD` |
| `NOW` | Current ISO 8601 datetime |
| `TRUE` | Boolean `true` |
| `FALSE` | Boolean `false` |
| Numeric strings | Parsed as numbers |

Actions column appears as the **last column** after rollups. Uses `processFrontMatter()` for atomic updates.

### Date / Datetime Columns

Auto-detected via three layers:
1. **Obsidian's property type registry** (`types.json` + `metadataTypeManager`)
2. **Data detection** — scans first 10 rows for ISO date patterns (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`)
3. **Persisted cache** — non-text types stored in `colType_{propId}` config key so they survive empty columns

Dates display as `MM/DD/YYYY`; datetimes as `MM/DD/YYYY HH:MM`. Stored in frontmatter as ISO format.

**Editing**: Click cell to type `mm/dd/yyyy`, or click calendar icon for popup with month navigation, day grid, today/clear buttons, and time picker (datetime only).

### Priority Enhanced UI

Columns named exactly `priority` (case-insensitive property name) are auto-detected. Enhanced UI is enabled by default and renders values as color-coded chips:

| Value | Color |
|-------|-------|
| `high` | Red (`#e74c3c`) |
| `medium` | Yellow (`#f5d89a`) |
| `low` | Blue (`#a3d5f5`) |
| Other | Gray (`#e0e0e0`) |

Toggle via: right-click column header → **Enhanced UI** checkbox, or set `priorityEnhanced_note.priority: "false"` in the view config.

### Column Context Menu

Right-click any column header to access:
- **Hide column** — removes column from view order
- **Sort A→Z / Z→A** — sort rows by this column (checkmark shows active sort)
- **Clear sort** — remove active sort
- **Property type** — shows inferred type (Text, Number, Relation, Tags, etc.)
- **Enhanced UI** toggle — for priority and relation columns only

### File Context Menu

Right-click a file name cell to access:
- Open in new tab / to the right / in new window
- Rename
- Copy path
- Open in default app / Show in system explorer
- Delete file (moves to trash)

### Group-By

Group rows by any property. Set `groupBy` at the view level:

```yaml
views:
  - name: Grouped View
    type: relational-table
    order: [file.name, note.status, note.priority]
    groupBy: note.status
```

Groups render as collapsible sections with headers showing the group value.

### Inline Editing

Editable directly in cells:
- **Text** and **number** — double-click or Enter to edit inline
- **Checkbox** — click to toggle
- **Date/datetime** — click to type `mm/dd/yyyy`, click calendar icon for popup
- **List/tags** — click to open chip editor with type-ahead suggestions
- **Relation columns** — click to open relation picker (CreatableSelect with folder-filtered suggestions; type to create new notes)
- **Rollup columns** — read-only (computed)
- **Quick action buttons** — click to execute

All edits persist via a debounced write queue (250ms debounce, 25ms between operations) through `EditEngineService`. Bidi sync uses `processFrontMatter` for atomic writes.

## Column Type Detection

The plugin infers column types for header icons and editing behavior using three layers (in order):

1. **Obsidian registry** — reads `types.json` and `metadataTypeManager` for assigned types (multitext→list, tags, checkbox, number, date, datetime)
2. **Data detection** — scans first 10 rows for value types (boolean→checkbox, number, array→list, ISO date/datetime strings)
3. **Persisted cache** — non-text types are saved to `colType_{propId}` in the `.base` file so they survive cell clears and plugin reloads

Supported types: `file`, `relation`, `tags`, `list`, `checkbox`, `number`, `text`, `date`, `datetime`, `rollup`, `actions`, `priority`.

## Complete .base Example

```yaml
filter:
  conjunction: and
  conditions:
    - field: file.folder
      operator: is
      value: tasks
    - field: file.ext
      operator: is
      value: md
views:
  - name: Full-Featured View
    type: relational-table
    order:
      - file.name
      - note.project
      - note.priority
      - note.status
      - note.done
      - note.hours
      - note.tags
    groupBy: note.status
    relationDetection: auto
    rollupCount: "1"
    rollup1_relation: note.project
    rollup1_target: hours
    rollup1_aggregation: sum
    rollup1_name: Project Hours
    bidiCount: "1"
    bidi1_column: note.project
    bidi1_reverse: tasks
    quickActions: "Done:status=done,completed=TODAY;Archive:archived=TRUE"
```

## Agent Notes

### Config reads from view-level flat keys, not `options:`

When editing `.base` files, config placed inside the `options:` block is **not read** by the plugin at runtime. `this.config.get(key)` reads from view-level flat keys only. The `options:` block defines the Configure view panel structure but doesn't store runtime values. Both locations are valid YAML, so no parse errors — it just silently doesn't work. Always put config keys (`rollupCount`, `rollup1_relation`, `bidiCount`, `quickActions`, `colType_*`, `priorityEnhanced_*`, `relationEnhanced_*`) as **view-level flat keys**.

### Obsidian Value objects use `.data`, not `.value` or `.values`

The Obsidian Bases API returns `Value` objects from `entry.getValue(propId)`. The `.d.ts` types suggest constructor args like `value: T`, but at runtime the actual property is `.data`. Always use `.data` to extract the underlying value. `ListValue.data` = array of nested Value objects; `PrimitiveValue.data` = string/number/boolean; `LinkValue.data` = string path.

## Troubleshooting

- **Relation column not detected** — Requires a matching subfolder: property `project` needs `<baseFolder>/project/` or `<baseFolder>/projects/` to exist as a folder. This is the only detection method — wikilink content alone does not trigger relation detection.
- **Rollup shows empty** — Check that `rollupN_relation` uses the full property ID (`note.project`) and `rollupN_target` uses the bare name (`hours`). The linked notes must have that frontmatter property. Ensure config is at view-level, not inside `options:`.
- **Bidi sync not writing** — Verify `bidiN_column` matches the relation column's property ID and `bidiN_reverse` is the bare property name. Config must be view-level flat keys.
- **Quick action not appearing** — Check DSL syntax: actions separated by `;`, updates by `,`, key-value by `=`. Example: `Done:status=done,completed=TODAY`. The `quickActions` key must be view-level.
- **Config not working** — Most common cause: keys placed inside `options:` instead of at view level. Move all config keys to be siblings of `order`, `sort`, `groupBy`.
- **Group-by not working** — `groupBy` goes at the view level (sibling of `order`). Use the full property ID: `note.status`.
- **Changes not persisting** — The plugin uses a debounced write queue (250ms). Wait ~300ms after editing. Bidi sync uses `processFrontMatter` for atomic writes.
- **Date column showing as text** — Ensure the property is registered as `date` or `datetime` in Obsidian's property settings. Alternatively, populate at least one row with a valid ISO date — the plugin will detect and persist the type.
- **Priority colors not showing** — Property must be named exactly `priority`. Enhanced UI defaults to on; check it hasn't been disabled via `priorityEnhanced_note.priority: "false"`.
- **Plugin not loading** — Requires Bases plugin v1.10.0+ with the Plugin API enabled.
