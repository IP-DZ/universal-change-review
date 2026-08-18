# Universal Change Review

Local, read-only Git change review for Codex, Claude Code, Cursor, and any MCP-compatible client. Version 0.4 adds one-click Changes entry points: a Cursor activity-bar extension and an MCP Apps launcher card for compatible Codex/ChatGPT hosts.

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
| `changes_open_panel` | Start a live, read-only Changes panel on localhost |

The MCP server also exposes two reusable prompts when the client supports MCP prompts:

| Prompt | Purpose |
| --- | --- |
| `review-changes` | Run a findings-first review of the current Changes |
| `begin-change-task` | Capture a baseline before implementation begins |

Task snapshots use a temporary Git index and store only a Git tree id plus metadata under `.git/universal-change-review/`. Ignored files are not captured. No source code is uploaded.

## Codex

Clone the repository, register its marketplace, then install the plugin:

```bash
git clone https://github.com/IP-DZ/universal-change-review.git
codex plugin marketplace add ./universal-change-review
codex plugin install universal-change-review@ip-dz
```

The Codex package includes the `change-review` skill, UI metadata, starter prompts, the MCP server definition, and an MCP Apps launcher card. Invoke the skill explicitly with `$change-review`, or ask Codex to open the current Changes. Compatible hosts render a clickable **Open Changes** card; other hosts receive the same localhost URL as text.

## Claude Code

Install from the repository as a Claude Code plugin to get its skill and `/review-changes` command, or add the MCP server directly:

```bash
claude mcp add universal-change-review --scope user -- npx -y github:IP-DZ/universal-change-review mcp
```

## Cursor

For the closest DSH-style experience, install the bundled Cursor extension:

```bash
npm run build:cursor
cursor --install-extension dist/universal-change-review-cursor-0.4.0.vsix --force
```

After reloading Cursor, click **Changes Review** in the bottom status bar, or use the **Changes Review** activity-bar icon. The extension automatically follows the first open workspace and opens the live panel in a Cursor editor tab. It runs the same local, read-only panel code bundled inside the extension.

For a project-scoped setup, copy `.cursor/mcp.json`, `.cursor/rules/change-review.mdc`, and `.cursor/commands/review-changes.md` into a project. Then use `/review-changes` in Cursor chat.

For a global MCP setup, merge this server into `~/.cursor/mcp.json` without replacing existing entries:

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

Cursor's global MCP configuration makes the tools available in every repository. Cursor rules and custom commands are project-scoped, so copy the provided rule and command into repositories where you want the guided workflow.

## Recommended workflow

1. Before a substantial task, ask the agent to start a change baseline.
2. Implement and validate the requested behavior.
3. Run `$change-review`, `/review-changes`, or the MCP `review-changes` prompt depending on the client.
4. Review findings ordered by P0-P3 severity, followed by changed behavior, validation, and remaining risks.

## Live Changes panel

Ask the agent to “open Changes”, call the `changes_open_panel` MCP tool, or run:

```bash
npx -y github:IP-DZ/universal-change-review web --cwd /path/to/repo
```

The returned localhost page provides live file counts, All/Staged/Unstaged filters, task-baseline selection, and line-level per-file diffs. It binds only to `127.0.0.1`, uses a random access token, and exposes no write or revert endpoint.

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
npm run build:cursor
```

MIT © IP-DZ
