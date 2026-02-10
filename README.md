# Powerbase

Notion-style relations, rollups, and bidirectional sync for Obsidian Bases.

**Requires**: Obsidian 1.10.0+ with Bases core plugin enabled.

## Install

1. Copy `main.js`, `manifest.json`, `styles.css` into `<your-vault>/.obsidian/plugins/powerbase/`
2. Settings > Community Plugins > Enable **Powerbase**
3. Open any `.base` file > view switcher > **Relational Table**

---

## Basic: Relations

Your existing frontmatter already works as relations. The plugin auto-detects two patterns:

**Wikilink lists** — arrays of `[[note]]` references:

```yaml
related:
  - "[[Note A]]"
  - "[[Note B]]"
```

**Text references** — plain strings matching a file name:

```yaml
project: "My Project"
```

If `My Project.md` exists in your vault, this renders as a clickable link.

### What you can do

- Click a relation chip to navigate to that note
- Click **+** to open a searchable picker and add/remove linked notes
- Type a new name in the picker to create a note on the fly

---

## Intermediate: Rollups

Aggregate a property from notes linked via a relation column. Rollup columns are virtual — computed on each render, not stored as Bases properties.

1. Open **Configure view** (click the view name or `⋮` menu at the top of the base)
2. Set **Number of Rollups** to 1, 2, or 3
3. For each rollup, configure:

| Setting | What to enter | Example |
|---|---|---|
| Relation Property | Property ID of the relation column | `note.related` |
| Target Property | Frontmatter key on the linked notes | `hours` |
| Aggregation | How to combine values | `sum` |
| Column Name | Header label | `Total Hours` |

### Available aggregations

| Function | Output |
|---|---|
| count | Number of linked notes |
| count_values | Non-empty values only |
| sum / average / min / max | Numeric aggregation |
| list | All values, comma-separated |
| unique | Deduplicated list |
| percent_true | `(N/M) X%` for booleans |
| percent_not_empty | `(N/M) X%` for any type |

---

## Advanced: Bidirectional Sync & Navigation

### Bidirectional relations

When you add `[[Project Alpha]]` to a task's `project` column, the plugin can automatically add `[[Task 1]]` to Project Alpha's `tasks` property.

Configure in **Configure view**:
1. Set **Number of Bidi Syncs** to 1–3
2. Set **Relation Column** to the property ID (e.g. `note.project`)
3. Set **Write Back-Link To** to the reverse property name (e.g. `tasks`)

### Inline cell editing

Same as vanilla Bases — double-click text/number cells to edit, single-click checkboxes to toggle. The Relational Table view preserves this behavior.

### Keyboard navigation

| Key | Action |
|---|---|
| Arrow keys | Move focus between cells |
| Tab / Shift+Tab | Move right/left, wrapping rows |
| Enter | Start editing focused cell |
| Escape | Cancel edit or unfocus |

### Grouping & summary

If your base has grouping configured, the Relational Table renders group headers with row counts. Summary values (configured in the base) appear in a sticky footer row.

### Column resizing

Drag the right edge of any column header to resize.

---

## Migrating from vanilla Bases?

See [MIGRATION.md](MIGRATION.md) for a detailed walkthrough with common scenarios and troubleshooting.
