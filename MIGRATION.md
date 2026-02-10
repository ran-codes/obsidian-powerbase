# Migrating from Bases to Powerbase

This guide helps you add relational database features to your existing Obsidian Bases setup. The plugin extends Bases with a custom "Relational Table" view — your existing `.base` files, filters, sorts, and formulas continue to work unchanged.

## What You Get

| Feature | Vanilla Bases | With This Plugin |
|---|---|---|
| Relation columns | Manual `[[wikilink]]` lists | Auto-detected, clickable chips, picker UI |
| Rollup columns | Not available | Count, sum, average, min, max, list, unique, percent |
| Bidirectional sync | Not available | Add `[[B]]` to A, `[[A]]` appears in B |
| Inline cell editing | Built-in | Preserved in Relational Table view |
| Text-reference relations | Not available | `project: "My Project"` resolves to `My Project.md` |

## Prerequisites

- Obsidian 1.10.0+ (Bases Plugin API)
- Bases core plugin enabled

## Step 1: Install the Plugin

Copy `main.js`, `manifest.json`, and `styles.css` into:

```
<your-vault>/.obsidian/plugins/powerbase/
```

Enable "Powerbase" in Settings > Community Plugins.

## Step 2: Switch a Base to Relational Table View

1. Open any `.base` file
2. Click the view switcher (top-left of the base)
3. Select **Relational Table**

Your existing columns, filters, sorts, and grouping carry over automatically. The plugin reads the same `BasesQueryResult` that the built-in table uses.

## Step 3: Relation Columns (Auto-Detection)

The plugin auto-detects relation columns using two patterns:

### Pattern A: Wikilink Lists (recommended)

Frontmatter with arrays of `[[wikilinks]]`:

```yaml
---
related-projects:
  - "[[Project Alpha]]"
  - "[[Project Beta]]"
tags:
  - task
---
```

These render as clickable chips. Click a chip to navigate, click "+" to open the picker.

### Pattern B: Text References

Frontmatter with plain-text values matching file basenames or aliases:

```yaml
---
project: "Project Alpha"
organization: "Acme Corp"
---
```

If `Project Alpha.md` exists in your vault (or any note has `Project Alpha` as an alias), the plugin detects this as a relation. This pattern is common in task/project workflows where properties reference other notes by name.

**Detection threshold**: >50% of sampled values must resolve to vault files.

## Step 4: Configure Rollups

Rollups aggregate a property from notes linked via a relation column.

1. In the Relational Table view, open **Configure view** (click the view name or `⋮` menu)
2. Change **Number of Rollups** from "None" to the number you want (1–3)
3. Fill in the fields for each rollup:
   - **Relation Property**: the property ID of your relation column (e.g., `note.related-projects`)
   - **Target Property**: the frontmatter key to read from linked notes (e.g., `hours`, `status`, `priority`)
   - **Aggregation**: count, sum, average, min, max, list, unique, percent_true, percent_not_empty
   - **Column Name**: display name for the rollup column header

### Example: Task Hours Rollup

If your tasks base has:
- A `project` relation column pointing to project notes
- Each project note has an `hours` frontmatter property

Configure:
- Relation Property: `note.project`
- Target Property: `hours`
- Aggregation: `sum`
- Column Name: `Total Hours`

## Step 5: Bidirectional Relations

When you add `[[Project Alpha]]` to a task's `project` column, the plugin can write `[[Task 1]]` into Project Alpha's `tasks` property — just like Notion's bidirectional relations.

Configure in **Configure view**:
1. Set **Number of Bidi Syncs** to 1 (up to 3)
2. **Bidi Sync 1: Relation Column** = `note.project` (the column you edit)
3. **Bidi Sync 1: Write Back-Link To** = `tasks` (the property on the target note)

**Limitations**:
- Only syncs when editing through the Relational Table picker (not manual YAML edits)
- Text-reference relations do not trigger bidirectional sync (only wikilink lists)
- If the target property is not an array, the plugin won't modify it

## Step 6: Editing in the Relational Table

Inline cell editing works the same as vanilla Bases — double-click text/number cells, single-click checkboxes. This behavior is preserved in the Relational Table view.

For relation cells specifically, click "+" to open the picker, or click a chip to navigate.

## Common Migration Scenarios

### Tasks Base with Project References

**Before** (vanilla Bases): `project: "My Project"` displays as plain text.

**After** (Relational Table): `project: "My Project"` auto-detects as a relation if `My Project.md` exists. Click to navigate. Add a rollup to aggregate task counts per project.

### Projects Base with Related Tasks

**Before**: No way to see which tasks reference a project.

**After**: Add a `related-tasks` property as a wikilink list. Bidirectional sync keeps both sides in sync. Add rollups for task count, completion percentage, or total hours.

### Knowledge Base with Topic Grouping

**Before**: Grouping by topic in vanilla Bases table.

**After**: Same grouping works in Relational Table. Group headers show the value and row count. Summary row shows aggregate values at the bottom.

## Troubleshooting

**Relation column not detected?**
- For wikilink lists: ensure values are `"[[NoteName]]"` format (with quotes in YAML)
- For text references: ensure the referenced file exists in the vault and the basename matches exactly (case-insensitive)
- Check that the property ID starts with `note.` (file-level properties like `file.name` are not relation candidates)

**Rollup shows 0 or empty?**
- Verify the relation property ID matches exactly (include the `note.` prefix)
- Verify the target property exists in the linked notes' frontmatter
- Check that linked notes are resolvable (not broken links)

**Bidirectional sync not working?**
- Only works with wikilink `[[...]]` relations, not text references
- Check that the target file exists and is a markdown file
- The back-link property must be an array or not exist yet (won't overwrite non-array properties)
