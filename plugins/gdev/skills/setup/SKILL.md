---
name: setup
description: Set up gdev product management in a repository — a guided configuration dialog for a new project, or an audit that adopts and restructures an existing project's backlog/docs/issues into the gdev standard. Use when the user wants to start a project, "set up PM", configure/initialise the board, or review/restructure how an existing project is managed.
argument-hint: "[new|adopt|audit]"
allowed-tools: Bash, Read, Glob, Grep, Write, Edit, AskUserQuestion
---

# /gdev:setup

Talk to the user in their language. Keep tool output small: never dump whole files you do not need.

CLI source: `${CLAUDE_PLUGIN_ROOT}/bin/pm.mjs` (if that variable is not expanded, Glob `~/.claude/plugins/**/gdev/bin/pm.mjs`). After init every project has its own copy at `.pm/pm.mjs` — use that afterwards.

## 1. Detect the mode (no questions yet)
Run one Bash call: `ls -a; ls .pm docs 2>/dev/null; git log --oneline -5 2>/dev/null; gh issue list --limit 5 2>/dev/null`
- `.pm/board.json` exists → **audit** (step 4).
- Other planning artefacts exist (`docs/product-delivery`, `docs/handover`, `BACKLOG*`, `ROADMAP*`, `TODO*`, `*.stories.md`, GitHub issues, TODO comments) → **adopt** (steps 2–3, then 5).
- Otherwise → **new** (steps 2–3).

## 2. Configuration dialog (one AskUserQuestion call, ≤ 4 questions)
Propose defaults inferred from the repo (name from folder/package.json, key = 3 letters of the name).
1. Project key for IDs (e.g. `ASF` → `ASF-12`) — offer the inferred key and one alternative.
2. Cadence: `2-week sprints (Recommended)` · `1-week sprints` · `Kanban (no sprints)`.
3. WIP limit: `2 (Recommended)` · `1` · `3`.
4. Start from: `Idea / brief now` · `Existing docs` · `Empty board`.
Ask the one-line product description in plain chat only if it cannot be inferred from README.

## 3. Initialise
```
node "<CLI source>" init --name "<name>" --key <KEY> --sprint-days <7|14> --wip <n>
```
Then append this block to the project `CLAUDE.md` (create it if missing; skip if a `## Product management (gdev)` heading exists):
```
## Product management (gdev)
- Board: `.pm/` — query with `node .pm/pm.mjs status|next|ls|show <ID>`; never read/edit `.pm/board.json` directly.
- Work items: `.pm/items/<ID>.md` are the specs. Branch `feat/<ID>-slug`, commits/PRs mention the ID (`closes <ID>`) — hooks update status.
- Hooks treat every ID in a code commit/PR as work on it: mention only the item being worked on (no "related/see/follow-up" IDs). Board-only changes (`.pm/`) go in a separate `chore(pm): …` commit, where any IDs are ignored.
- Skills: /gdev:plan · /gdev:stories · /gdev:bug · /gdev:refine · /gdev:sprint · /gdev:build · /gdev:status
- For "what's next / status / where did we leave off" use the `tracker` agent or `/gdev:status`.
```
Make sure `.pm/` is NOT git-ignored (the board is versioned with the code).
If the user chose "Idea / brief now", continue with the `/gdev:plan` flow.

## 4. Audit an existing gdev board
Run `node .pm/pm.mjs doctor`, `node .pm/pm.mjs check --all`, `node .pm/pm.mjs status`, `wc -l .pm/product.md .pm/log.md`. Report a short table: problem · impact · fix. Offer to fix (one AskUserQuestion, multiSelect). Apply fixes only through the CLI (`set`, `move`, `block`, `roadmap`, `upgrade`).

## 5. Adopt (restructure an existing project)
1. Inventory, cheaply: list candidate files with sizes (`wc -l`), read headings first (`grep -n '^#' file`), open only the sections you need. For GitHub: `gh issue list --state open --limit 100 --json number,title,labels`. For code: `grep -rn "TODO\|FIXME" --include=* -l | head`.
2. Build a **migration plan** and show it as a compact table: source → gdev target (product.md section, epic, story, bug, roadmap horizon, drop). Map: vision/README → product.md; milestones/roadmap → `roadmap add`; epics/features → `add epic`; stories/issues → `add story|bug` (keep the original ID or issue # in the item's Notes); "done" items → `--status done` only if relevant for velocity, otherwise skip.
3. Ask for approval (AskUserQuestion: `Migrate all (Recommended)` · `Only open items` · `Let me edit the plan`).
4. Execute with CLI calls batched in a single Bash script (one `node .pm/pm.mjs add …` per line), then write item bodies with Write — fill Story/AC from the source, mark unknowns as `- Q:` so refinement catches them.
5. Never delete the old docs; suggest archiving them under `docs/archive/` and add a pointer line. Finish with `doctor` + `check` and a 5-line summary.
