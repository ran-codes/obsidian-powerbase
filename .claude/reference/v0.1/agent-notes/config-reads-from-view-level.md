# Config reads from view-level flat keys, not `options:`

## Discovery

When editing `.base` files, rollup/bidi/quickActions config placed inside the `options:` block is **not read** by the plugin at runtime. `this.config.get(key)` reads from view-level flat keys only.

## What happens

The Bases Plugin API's `config` object maps to flat keys on the view object in the `.base` YAML:

```yaml
views:
  - type: relational-table
    name: My View
    order: [...]
    options:
      rollupCount: "1"          # NOT read by this.config.get()
    rollupCount: "1"            # READ by this.config.get()
    rollup1_relation: note.project
```

The `options:` block is only used by `getViewOptions()` to define the Configure view panel's structure. The actual runtime config lives as sibling keys to `order`, `sort`, `groupBy`, etc.

## Why it's confusing

- The Configure view panel writes to view-level flat keys
- The CLAUDE.md examples (incorrectly) showed config inside `options:`
- Both locations are valid YAML, so no parse errors — it just silently doesn't work

## Rule

When editing `.base` files programmatically, always put config keys (`rollupCount`, `rollup1_relation`, `bidiCount`, `quickActions`, `colType_*`, `priorityEnhanced_*`, etc.) as **view-level flat keys**, not nested inside `options:`.

## Source

- `relational-table-view.ts` — all `this.config.get(key)` calls
- `this.config.set(key, value)` writes to view level (see `persistColumnType()`, sort/order updates)
