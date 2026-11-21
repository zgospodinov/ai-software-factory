---
name: sprint
description: Sprint/iteration planning and closing for a solo developer — set a sprint goal, commit ready items within capacity (velocity), start, review progress, close with velocity and a mini-retrospective. Use when the user wants to plan a sprint/iteration/week, start or close a sprint, or run a retro.
argument-hint: "[plan | start | review | close]"
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# /gdev:sprint

Talk in the user's language. All state changes go through `node .pm/pm.mjs sprint …`.
If `config.json` has no sprint cadence the user chose Kanban: skip sprints, use `next` + WIP limit, and run the `close` retro monthly.

## plan (default when no active sprint)
1. `node .pm/pm.mjs sprint ls` and `node .pm/pm.mjs status`. If a sprint is still active and past its end date → do `close` first.
2. `sprint new --goal "<goal>"` — propose ONE sprint goal derived from the top roadmap "now" item (outcome, not a list). Ask the user to confirm/edit it together with the commitment.
3. `node .pm/pm.mjs sprint plan` → suggested ready items within capacity. Rules: P0 bugs first; items serving the goal next; leave ~20% slack for bugs/unplanned work; do not commit items that are not `ready` (offer `/gdev:refine` for the gap).
4. One AskUserQuestion: `Commit suggested (Recommended)` · `Commit fewer` · `Pick myself`. Then `sprint add <IDs…>` and `sprint start`.
5. Output: goal, committed points/capacity, ordered list — ≤ 8 lines.

## review (mid-sprint check)
`node .pm/pm.mjs status` + `ls --sprint current`. Report progress vs. elapsed time (points done % vs days elapsed %), risks (blocked, stale, scope added), and a recommendation (keep, drop scope, swap). Never change scope without approval.

## close
1. `node .pm/pm.mjs sync` (catch last commits) then `sprint close` — it records velocity and returns unfinished items to the backlog.
2. Mini-retro: ask ONE AskUserQuestion with 2 questions — "What helped?" / "What slowed you down?" (offer typical options: unclear specs, scope creep, tooling, interruptions, AI rework). Turn the top answer into one concrete improvement → `add chore "<improvement>" --prio P1`.
3. Append to `.pm/log.md` via `log "retro SP-n: helped …; slowed …; action <ID>"`. Move shipped roadmap items: `roadmap set R-n horizon=shipped` when their epic is done.
4. Offer to plan the next sprint.
