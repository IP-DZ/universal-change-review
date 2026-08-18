---
name: change-review
description: Review repository changes or isolate changes made during the current task. Use after editing code, before claiming completion, or when the user asks what changed.
---

# Change Review

Use the Universal Change Review MCP tools to make changes inspectable.

1. At the beginning of an implementation task, call `changes_begin` and retain its snapshot id.
2. After edits, call `changes_since` with that id to isolate task-scoped changes.
3. Before completion, call `changes_summary` and inspect risky files with `changes_diff`.
4. Report changed files, behavioral impact, tests run, and unresolved risks.
5. Never claim a clean result from an empty diff without checking repository status.

The plugin is intentionally read-only for source files. Do not simulate an undo by running destructive Git commands unless the user explicitly requests it and the exact target is confirmed.
