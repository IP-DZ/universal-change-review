# Universal Change Review

Local, read-only Git change review for Codex, Claude Code, Cursor, and any MCP-compatible client.

It provides total workspace diffs, staged/unstaged views, file-level inspection, and task-scoped snapshots that isolate only the changes made after a task begins. Source files and the real Git index are never modified by the review tools.

## Requirements

- Node.js 20+
- Git 2.30+
- A Git repository

## Tools

| Tool | Purpose |
| --- | --- |
| `changes_summary` | Status, diff stat, and per-file additions/deletions |
| `changes_diff` | Full or file-scoped diff for all/staged/unstaged changes |
| `changes_begin` | Capture a task baseline without changing the real index |
| `changes_since` | Compare the current repository with a task baseline |
| `changes_snapshots` | List saved baselines for the current repository |

Task snapshots use a temporary Git index and store only a Git tree id plus metadata under `.git/universal-change-review/`. Ignored files are not captured. No source code is uploaded.

## Codex

Clone the repository, register its marketplace, then install the plugin:

```bash
git clone https://github.com/IP-DZ/universal-change-review.git
codex plugin marketplace add ./universal-change-review
codex plugin install universal-change-review@ip-dz
```

The Codex package includes the `change-review` skill and the MCP server definition.

## Claude Code

Install from the repository as a Claude Code plugin, or add the MCP server directly:

```bash
claude mcp add universal-change-review --scope user -- npx -y github:IP-DZ/universal-change-review mcp
```

## Cursor

Copy `.cursor/mcp.json` and `.cursor/rules/change-review.mdc` into a project, or add this server to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "universal-change-review": {
      "command": "npx",
      "args": ["-y", "github:IP-DZ/universal-change-review", "mcp"]
    }
  }
}
```

## CLI

Run directly from GitHub:

```bash
npx -y github:IP-DZ/universal-change-review summary --cwd /path/to/repo
npx -y github:IP-DZ/universal-change-review begin --cwd /path/to/repo --label feature
npx -y github:IP-DZ/universal-change-review since --cwd /path/to/repo --id SNAPSHOT_ID
```

## Safety

- No undo, reset, checkout, commit, push, or file-write tool is exposed.
- The worktree and real Git index are not changed.
- Snapshot capture writes normal Git blob/tree objects and metadata inside `.git`.
- Diff output is capped by default and can be limited to one file.
- Clients should still request user approval before launching third-party MCP servers.

## Development

```bash
npm test
npm run check
```

MIT © IP-DZ
