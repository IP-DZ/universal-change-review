---
name: change-review
description: Review Git changes with local MCP evidence, isolate edits made during the current task, and report correctness, regression, security, performance, and testing risks. Use before substantial code edits to establish a baseline; after editing code; before claiming implementation is complete; or when the user asks to inspect Changes, review a diff, explain what changed, or find problems in uncommitted work.
---

# Change Review

Use the Universal Change Review MCP tools to inspect code changes.

When the user asks to see or open Changes, call `changes_open_panel` and provide its localhost URL. The panel is read-only and updates while the MCP server remains running.

1. Before substantial edits, call `changes_begin` and retain its snapshot id.
2. After edits, call `changes_since` to isolate task changes from pre-existing work.
3. Call `changes_summary`, then inspect relevant files with `changes_diff`. If truncated, inspect files individually.
4. Check correctness, regressions, error paths, security, performance, compatibility, and tests as applicable.
5. Report actionable findings first using P0-P3 severity with file/line evidence. Then summarize changed behavior, validation actually run, and remaining risks.

Do not modify source files during a review unless the user asks for fixes. Never claim a clean result from an empty diff without checking repository status.
