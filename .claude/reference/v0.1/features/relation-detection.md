# Relation Detection — Folder-Match Only

## Problem

The current `detectRelationColumn()` uses 4 patterns to auto-detect relation columns:

| Pattern | Mechanism | False positive risk |
|---------|-----------|---------------------|
| 1a | Wikilink arrays (`[[...]]`) | Low |
| 1b | Path arrays resolving to vault files | Medium |
| 2 | Scalar text matching file basenames/aliases (>50% of 10 rows) | **High** |
| 3 | Property name matches a subfolder | Low |

Pattern 2 causes false positives when plain-text columns happen to contain values that match filenames. Example: a `project-base` column with values like `HCUP` triggers because `HCUP.md` exists in the vault. The user intended this as a plain text backup column, not a relation.

Patterns 1a/1b also risk false detection on list-type properties that coincidentally contain strings matching file paths.

## Decision

**Remove patterns 1a, 1b, and 2. Keep only pattern 3 (folder matching).**

Folder matching is the most conservative signal — it requires a deliberate structural convention (a subfolder matching the property name). Users who want relation columns can:
1. Name their property to match a folder (e.g., `project` → `Projects/` exists)
2. Or explicitly configure relation detection in the future (out of scope for this change)

## Implementation

### Changes to `relational-table-view.ts`

**`detectRelationColumn()`** — strip to folder-match only:

```ts
private detectRelationColumn(propId: string, rows: TableRowData[], baseFolder?: string): boolean {
    if (!propId.startsWith('note.')) return false;
    return !!this.matchRelationSubfolder(propId, baseFolder);
}
```

**`getBaseFolder()`** — return `""` (vault root) instead of `undefined` when common parent has no parent slash. This ensures folder matching works when entries are one level below root (e.g., `tasks/YYYY-MM-DD/` → base folder = vault root → finds `Projects/`).

Two lines change:
- Line ~673: `if (!common) return '';` (was `return undefined`)
- Line ~679: `return parentSlash >= 0 ? common.substring(0, parentSlash) : '';` (was `common || undefined`)

**`matchRelationSubfolder()`** — handle empty-string baseFolder:
- Guard: `if (baseFolder == null)` instead of `if (!baseFolder)`
- Path construction: use `prefix = baseFolder ? baseFolder + '/' : ''` to avoid leading `/`

### No changes needed

- `NoteSearchService.ts` — `isTextReference()` / `resolveTextReference()` remain unchanged (still used by RelationEditor for the picker)
- `RelationCell.tsx`, `RelationEditor.tsx` — unchanged, they resolve values at render time
- `inferRelationFolder()` — unchanged, still uses `matchRelationSubfolder()` with fallback to baseFolder

## Test plan

- [ ] Column with values matching filenames (e.g., `project-base: HCUP`) is NOT detected as relation
- [ ] Column named `project` with `Projects/` folder at root IS detected as relation
- [ ] Column named `organization` with `Organizations/` folder IS detected (plural matching)
- [ ] Vaults with entries deeper than one level (e.g., `test-v1/tasks/`) still resolve baseFolder correctly
- [ ] Relation picker still works when a column IS detected as relation via folder match
