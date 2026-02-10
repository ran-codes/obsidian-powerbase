# Powerbase — Plugin Reference

Obsidian plugin that extends **Bases** (v1.10.0+) with relation columns, rollup aggregations, bidirectional sync, quick actions, group-by, date/datetime editing, and priority-enhanced UI — all configured in `.base` files.

## What This Plugin Adds (vs Vanilla Bases)

- **Relation columns** — auto-detected wikilink lists rendered as clickable chips with a folder-filtered picker
- **Rollup columns** — aggregate values from linked notes (count, sum, average, min, max, list, unique, percent_true, percent_not_empty, count_values)
- **Bidirectional sync** — editing a relation on note A automatically writes a back-link on note B
- **Quick actions** — one-click buttons that set frontmatter properties (e.g. mark done, archive)
- **Group-by** — rows grouped by any property, with collapsible headers
- **Date/datetime columns** — calendar icon, MM/DD/YYYY display, custom calendar popup with month navigation, today/clear buttons
- **Priority enhanced UI** — auto-detected priority columns rendered as color-coded chips (red=high, yellow=medium, blue=low), toggleable via column context menu
- **List/tags chip editing** — inline chip editor with type-ahead suggestions dropdown, backspace to remove last chip
- **Column context menu** — right-click any column header to hide, sort (A→Z / Z→A), view property type, toggle enhanced UI for priority/relation columns
- **File context menu** — right-click file names for open in new tab/right/window, rename, copy path, show in explorer, delete
- **Inline editing** — edit text, number, checkbox, date, and list properties directly in cells

## View Setup

In any `.base` file, add a view with `"type": "relational-table"`:

```json
{
  "filter": {
    "conjunction": "and",
    "conditions": [
      { "field": "file.folder", "operator": "is", "value": "tasks" },
      { "field": "file.ext", "operator": "is", "value": "md" }
    ]
  },
  "views": [
    {
      "name": "My Relational View",
      "type": "relational-table",
      "order": [
        "file.name",
        "note.project",
        "note.priority",
        "note.done",
        "note.tags"
      ],
      "groupBy": "note.priority",
      "options": { }
    }
  ]
}
```

## Property ID Conventions

All property references use dot notation:
- `note.property-name` — frontmatter property (e.g. `note.project`, `note.tags`)
- `file.name` — file basename
- `file.folder` — file folder path
- `file.ext` — file extension

In rollup `targetProperty` and bidi `reverseProperty`, use the **bare property name** (no `note.` prefix): e.g. `hours`, `tasks`.

## Feature Reference

### Relation Columns

Auto-detected via four patterns (no manual config needed):
1. **Wikilink arrays** — frontmatter list where values match `[[...]]`
2. **Path arrays** — list of strings that resolve to vault files
3. **Text references** — scalar string matching a file basename or alias (sampled from first 10 rows)
4. **Folder match** — property name matches a subfolder (e.g. `project` → `projects/` exists). Catches empty columns.

**Folder filtering**: The relation picker auto-filters by subfolder inferred from the property name. `note.project` looks for `<baseFolder>/project/` or `<baseFolder>/projects/`. Falls back to the base folder (common parent of all entries, one level up).

To override detection mode, set in options:
```json
"options": {
  "relationDetection": "auto"
}
```
Values: `"auto"` (default), `"manual"`.

### Rollup Columns

Aggregate data from notes linked via a relation column. Configure up to 3 rollups.

```json
"options": {
  "rollupCount": "2",
  "rollup1_relation": "note.project",
  "rollup1_target": "hours",
  "rollup1_aggregation": "sum",
  "rollup1_name": "Total Hours",
  "rollup2_relation": "note.project",
  "rollup2_target": "status",
  "rollup2_aggregation": "count_values",
  "rollup2_name": "Active Projects"
}
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
| `list` | All values as a list |
| `unique` | Deduplicated values |
| `percent_true` | Percentage of boolean true values |
| `percent_not_empty` | Percentage of non-empty values |

### Bidirectional Sync

When a user adds/removes a link in a relation column, the plugin writes a corresponding back-link on the target note. Configure up to 3 bidi syncs.

```json
"options": {
  "bidiCount": "1",
  "bidi1_column": "note.project",
  "bidi1_reverse": "tasks"
}
```

**Config keys** (per sync, where N = 1–3):
| Key | Description |
|-----|-------------|
| `bidiN_column` | Property ID of the relation column to watch (e.g. `note.project`) |
| `bidiN_reverse` | Bare property name to write on the linked note (e.g. `tasks`) |

Example: If `task-1.md` has `project: [[Project Alpha]]`, bidi sync writes `tasks: ["[[task-1]]"]` into `Project Alpha.md`'s frontmatter.

### Quick Actions

One-click buttons that set frontmatter properties. Configured via a DSL string.

```json
"options": {
  "quickActions": "Done:status=done,completed=TODAY;Archive:archived=TRUE"
}
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

### Date / Datetime Columns

Auto-detected from Obsidian's property type metadata. Dates display in `MM/DD/YYYY` format; datetimes display as `MM/DD/YYYY HH:MM`. Stored in frontmatter as ISO format (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`).

**Editing**: Click the cell to type a date (`mm/dd/yyyy`), or click the calendar icon to open a popup with:
- Month navigation (chevron arrows)
- Day grid with today highlight and selected-day highlight
- "Today" button to set current date
- "Clear" button to remove the value
- Time picker (datetime columns only)

No special configuration needed — the plugin reads Obsidian's type metadata to detect date/datetime properties.

### Priority Enhanced UI

Columns named `priority` (or containing priority-like values: high/medium/low) are auto-detected. When enhanced UI is toggled on (via column context menu), values render as color-coded chips:

| Value    | Color  |
|----------|--------|
| `high`   | Red (`#e74c3c`) |
| `medium` | Yellow (`#f5d89a`) |
| `low`    | Blue (`#a3d5f5`) |
| Other    | Gray (`#e0e0e0`) |

Toggle via: right-click column header → **Enhanced UI** checkbox.

### Column Context Menu

Right-click any column header to access:
- **Hide column** — removes column from view
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

Group rows by any property. Set `groupBy` at the view level (not inside `options`):

```json
{
  "name": "Grouped View",
  "type": "relational-table",
  "order": ["file.name", "note.status", "note.priority"],
  "groupBy": "note.status"
}
```

Groups render as collapsible sections with headers showing the group value.

### Inline Editing

Editable directly in cells:
- **Text** and **number** properties — double-click or Enter to edit inline
- **Checkbox** properties — click to toggle
- **Date/datetime** properties — click to type `mm/dd/yyyy`, click calendar icon for popup
- **List/tags** properties — click to open chip editor with inline cursor and type-ahead suggestions
- **Relation columns** — click to open the relation picker (CreatableSelect with folder-filtered suggestions; type to create new notes)
- **Rollup columns** — read-only (computed)
- **Quick action buttons** — click to execute

All edits persist to frontmatter via a debounced write queue (250ms debounce, 25ms between operations).

## Complete .base Example

```json
{
  "filter": {
    "conjunction": "and",
    "conditions": [
      { "field": "file.folder", "operator": "is", "value": "tasks" },
      { "field": "file.ext", "operator": "is", "value": "md" }
    ]
  },
  "views": [
    {
      "name": "Full-Featured View",
      "type": "relational-table",
      "order": [
        "file.name",
        "note.project",
        "note.priority",
        "note.status",
        "note.done",
        "note.hours",
        "note.tags"
      ],
      "groupBy": "note.status",
      "options": {
        "relationDetection": "auto",
        "rollupCount": "1",
        "rollup1_relation": "note.project",
        "rollup1_target": "hours",
        "rollup1_aggregation": "sum",
        "rollup1_name": "Project Hours",
        "bidiCount": "1",
        "bidi1_column": "note.project",
        "bidi1_reverse": "tasks",
        "quickActions": "Done:status=done,completed=TODAY;Archive:archived=TRUE"
      }
    }
  ]
}
```

## Troubleshooting

- **Relation column not detected** — Ensure the frontmatter property contains wikilinks (`[[Note Name]]`) or that a matching subfolder exists (e.g. `projects/` for a `project` property). The plugin samples the first 10 rows.
- **Rollup shows empty** — Check that `rollupN_relation` uses the full property ID (`note.project`) and `rollupN_target` uses the bare name (`hours`). The linked notes must have that frontmatter property.
- **Bidi sync not writing** — Verify `bidiN_column` matches the relation column's property ID and `bidiN_reverse` is the bare property name to write on linked notes.
- **Quick action not appearing** — Check DSL syntax: actions separated by `;`, updates by `,`, key-value by `=`. Example: `Done:status=done,completed=TODAY`
- **Group-by not working** — `groupBy` goes at the view level (sibling of `order`), not inside `options`. Use the full property ID: `note.status`.
- **Changes not persisting** — The plugin uses a debounced write queue. Wait ~300ms after editing before closing the note. If using bidi sync, `processFrontMatter` handles atomic writes.
- **Date column showing as text** — The plugin reads Obsidian's property type metadata. Ensure the property is registered as `date` or `datetime` in Obsidian's property settings (Settings → Properties).
- **Priority colors not showing** — Right-click the column header and enable "Enhanced UI". Values must be `high`, `medium`, or `low` (case-insensitive).
- **Plugin not loading** — Requires Bases plugin v1.10.0+ with the Plugin API enabled. Check Settings → Community Plugins → Bases.
