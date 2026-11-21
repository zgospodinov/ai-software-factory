---
name: status
description: Quick project status, what to work on next, standup summary, or the board/epic tree, or the design index (design systems, canvases, screens) — from the gdev board in a few lines. Use for "status", "progress", "what's next", "where did we leave off", "standup", "show the board/backlog/roadmap".
argument-hint: "[next | standup | board | tree | roadmap | bugs | design]"
model: haiku
allowed-tools: Bash
---

# /gdev:status

Run exactly the CLI commands needed and answer in ≤ 10 lines, in the user's language. Do not open item files or board.json.

| Argument | Run |
|---|---|
| (none) | `node .pm/pm.mjs sync && node .pm/pm.mjs status && node .pm/pm.mjs next` |
| next | `node .pm/pm.mjs next` |
| standup | `node .pm/pm.mjs status`, `tail -n 15 .pm/log.md`, `git log --since=yesterday --oneline` → Yesterday / Today / Blockers |
| board | `node .pm/pm.mjs ls --sprint current` (or `ls --open` when no sprint) |
| tree | `node .pm/pm.mjs tree` |
| roadmap | `node .pm/pm.mjs roadmap` |
| bugs | `node .pm/pm.mjs ls --type bug` |
| design | `node "${CLAUDE_PLUGIN_ROOT}/bin/design.mjs" index && node "${CLAUDE_PLUGIN_ROOT}/bin/design.mjs" check` — relay as is; design work itself → `/gdev:design` |

If `.pm/` is missing say so and suggest `/gdev:setup`. If `doctor`-type problems appear (WIP exceeded, stale, blocked), mention them in one line and suggest the fix command. In Claude Desktop the `gdev-ui` mod shows the board live (`/gdev-board`).
