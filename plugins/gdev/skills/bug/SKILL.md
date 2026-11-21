---
name: bug
description: Report and document a bug/defect in a standard report (repro steps, expected/actual, environment, severity), triage it into a prioritised, plannable board item, and optionally investigate root cause. Use when the user reports a bug, defect, error, crash, regression or wrong behaviour, or pastes an error/stack trace, or asks to triage bugs.
argument-hint: "<what is broken> | triage | <ID> investigate"
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, AskUserQuestion
---

# /gdev:bug

Talk in the user's language. CLI: `node .pm/pm.mjs`.

## Report a bug
1. **Duplicate check**: `node .pm/pm.mjs ls --type bug --all | grep -i "<keyword>"`. If it matches an open bug, append the new evidence to that item instead.
2. **Extract** from the user's message (and any pasted log — trim it to the relevant ~10 lines): summary, steps, expected, actual, environment, evidence. If repro steps or expected/actual are missing, ask once with AskUserQuestion — no more than 3 questions — and offer "I don't know" options.
3. **Severity** (propose it, the user confirms by not objecting): S1 blocker / data loss / security · S2 major, no workaround · S3 workaround exists · S4 cosmetic. Priority follows (S1→P0 … S4→P3).
4. **Create**: `node .pm/pm.mjs add bug "<symptom in ≤ 8 words>" --severity S<n> [--epic <ID>]` then fill `.pm/items/<ID>.md` with Write (keep template headings). Titles describe the symptom ("Checkout total ignores discount"), not the guess at the cause.
5. **Plan it**:
   - S1/P0 → interrupt: offer to `pm start <ID>` now (or `sprint add <ID>` into the active sprint) and say what it displaces.
   - Otherwise it stays in `backlog`; it becomes `ready` through `/gdev:refine` (needs an estimate). If the bug is large, offer a spike or split.
6. Reply with ID, severity/priority, and where it is in the plan — 3 lines.
7. **Committing** (only if the user wants it): stage only `.pm/` and use `chore(pm): add bug <ID> <title>` (or `chore(pm): triage bugs`). Never mix bug reports into a code commit — hooks read every ID in a code commit as "work started" and would move the bugs to `doing`. In a code commit, mention only the ID being fixed.

## Triage (`triage`)
`node .pm/pm.mjs ls --type bug` → for bugs without severity/estimate or with `- Q:` open, propose severity/prio/points in one table, approve once, apply with `set`. Flag bugs older than 30 days in backlog: fix, schedule or drop (`move <ID> dropped` with a log line).

## Investigate (`<ID> investigate`)
Read the item, locate the area with graphify (if present) or targeted Grep, reproduce if possible (run the failing test/command). Write findings into **Root cause** and **AI context**, add a failing regression test only if the user wants the fix now (then continue as `/gdev:build <ID>`).
