---
name: change-review
description: Review Git changes with local MCP evidence, isolate edits made during the current task, and report correctness, regression, security, performance, and testing risks. Use before substantial code edits to establish a baseline; after editing code; before claiming implementation is complete; or when the user asks to inspect Changes, review a diff, explain what changed, or find problems in uncommitted work.
---

# Change Review

Use the Universal Change Review MCP tools to make changes inspectable. Treat tool output as evidence, not as proof that behavior is correct.

When the user asks to see, open, or visually inspect Changes, call `changes_open_panel` and provide its localhost URL. The panel is read-only and updates while the MCP server remains running.

1. Before a substantial implementation, call `changes_begin` and retain its snapshot id in the task context. Do not create a baseline for a read-only review.
2. After edits, call `changes_since` with that id. Separate task-scoped changes from work that already existed.
3. Call `changes_summary` before completion. Inspect every behaviorally relevant or risky file with `changes_diff`; use file-scoped calls when the total diff is truncated.
4. Check call sites, state transitions, error paths, compatibility, secrets, permissions, concurrency, resource lifetime, and test coverage as applicable.
5. Run the narrowest relevant validation available. Do not claim tests passed unless their output was observed.
6. Report actionable findings first, ordered by severity. Give each finding a file and line reference, impact, and concrete reason. If there are no findings, say so explicitly.
7. Then summarize changed behavior, validation performed, and remaining risks or unverified assumptions.

Use severity labels:

- P0: immediate catastrophic or security impact.
- P1: likely production failure, data loss, or serious regression.
- P2: real correctness, reliability, performance, or maintainability defect.
- P3: minor issue worth fixing; omit pure style preferences.

Do not treat pre-existing changes as task output. Never claim a clean result from an empty diff without checking repository status. If output is truncated, continue with per-file inspection before concluding.

The plugin is intentionally read-only for source files. Do not simulate an undo by running destructive Git commands unless the user explicitly requests it and the exact target is confirmed.
