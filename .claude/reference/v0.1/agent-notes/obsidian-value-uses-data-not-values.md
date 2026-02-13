# Obsidian Value objects use `.data`, not `.value` or `.values`

## Discovery

The Obsidian Bases API returns `Value` objects from `entry.getValue(propId)`. The `.d.ts` types suggest constructor args like `value: T`, but at runtime the stored property is `.data`.

## Rule

Always use `.data` to extract the underlying value from any Obsidian Value object. `.value` and `.values` do not exist.

## Full reference

See [obsidian-value-api.md](../obsidian-value-api.md) for the complete Value class hierarchy, `.data` contents by type, and the correct unwrapping pattern.
