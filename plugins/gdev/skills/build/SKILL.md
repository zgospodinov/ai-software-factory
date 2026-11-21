---
name: build
description: Implement a board item the AI-SDLC way — start it (status, branch), use its item file as the spec, implement with tests, verify against acceptance criteria and the Definition of Done, commit/PR with the ID so tracking updates automatically. Use when the user says to work on, implement, start, pick up or fix a specific item ID, or "take the next task".
argument-hint: "<ID | next>"
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, AskUserQuestion, Skill, Agent
---

# /gdev:build

1. **Pick**: `next` → `node .pm/pm.mjs next` and take the top item (confirm in one line, don't ask unless WIP is exceeded). Otherwise use the given ID.
2. **Start**: `node .pm/pm.mjs start <ID>` → prints the branch name and DoR warnings. If it is not ready (missing AC / open `Q:`), stop and resolve with the user first (refinement-light) — never implement guesses.
   Create the branch: `git switch -c <branch>` (or reuse it if it exists).
3. **Spec**: `node .pm/pm.mjs show <ID>` — the AC are the contract, "AI context" the boundaries, "Out of scope" is binding. Load code context cheaply (graphify query/path if `graphify-out/` exists, else targeted Grep; read only the files you will change).
4. **Plan briefly** (≤ 6 bullets) in chat; for changes touching > 5 files or an architectural decision, get a yes first.
5. **Implement test-first where practical**: write/adjust a test per AC (for bugs: a failing regression test first), then the code. Keep the diff focused on this item; note unrelated findings as new items (`add chore|bug …`) instead of fixing them inline.
6. **Verify (DoD)**: run the project's tests/lint/build; tick the AC checkboxes in the item file that are proven; self-review the diff (`git diff --stat`, then the risky hunks). Update docs/CHANGELOG if user-facing. For bugs fill **Root cause**.
7. **Commit** with Conventional Commits + ID: `feat(scope): <summary> <ID>`; final commit or PR body `closes <ID>`. Hooks move the item to review/done — confirm with `node .pm/pm.mjs status` (one line).
   - The message (and PR title/body) contains **only this item's ID**. Hooks treat every `<KEY>-<n>` as work on that item, so never reference other items there ("related to", "see", "follow-up", "found while fixing") — put those links in the item file's Notes or the report instead.
   - Items you created during the work (step 5) go into a separate `chore(pm): add <what>` commit that touches only `.pm/`; never stage them together with code.
8. Report: what changed, tests run and their result, AC status, anything left (as new item IDs).
