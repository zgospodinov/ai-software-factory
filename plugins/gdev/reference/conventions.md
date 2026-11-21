# gdev conventions (load only when a skill says so or you are unsure)

## Files — one source of truth per fact
| File | Holds | Rule |
|---|---|---|
| `.pm/config.json` | name, key, sprint length, capacity, WIP, DoR/DoD | edit rarely |
| `.pm/board.json` | items, sprints, roadmap (index + metadata) | **never edit by hand or read whole** — use the CLI |
| `.pm/items/<ID>.md` | the spec: story / bug report / epic goal | read only the item you work on (`pm show <ID>`) |
| `.pm/product.md` | product brief (≤ 80 lines) | current state only |
| `.pm/log.md` | append-only activity log | auto-rotated by CLI; never load by default |

CLI: `node .pm/pm.mjs <cmd>` (run `help` once if you need the syntax). Prefer `ls`/`status`/`check` output over opening files.

## Hierarchy & types
Roadmap item (R-n, horizon now/next/later/shipped) → **epic** (outcome) → **story** (vertical slice of user value) / **bug** / **spike** (timeboxed question) / **chore** (tech/ops work). Tasks are checkboxes inside the item file, not board items.

## Workflow states
`idea → backlog → ready → doing → review → done` (+ `dropped`, + `blocked` flag with reason)
- `ready` only when the Definition of Ready passes (`pm check <ID>`).
- WIP limit (default 2) — finish before starting.
- `review` = PR open / self-review; `done` = DoD met and merged.

## Definition of Ready (story / bug)
INVEST story statement or full bug report · testable AC (Given/When/Then) · estimate ≤ maxPoints (default 8) · no `- Q:` open questions · dependencies known · AI context filled (touches, constraints, out of scope).

## Definition of Done
AC verified · tests added/updated and green · self-review of the diff · docs/CHANGELOG if user-facing · merged to main.

## Estimation
Fibonacci story points 1,2,3,5,8,13 (relative effort+risk+uncertainty). > maxPoints ⇒ split. Spikes are timeboxed, not pointed. Capacity = avg velocity of the last 3 sprints (fallback `capacity` in config).

## Splitting patterns (in order of preference)
workflow steps · business-rule variations · happy path first / edge cases later · data variations · interface (API before UI) · CRUD operations · defer performance/NFR · spike + implementation.

## Bugs
Severity → default priority: **S1** blocker / data loss / security → P0 · **S2** major, no workaround → P1 · **S3** workaround exists → P2 · **S4** cosmetic → P3.
P0 bugs interrupt the sprint (pull in now); others go through refinement like stories. Every fixed bug gets a regression test and a filled "Root cause".

## Priority
P0 now/interrupt · P1 this sprint/next · P2 normal · P3 nice to have. Order within a priority with `rank`. Use value ÷ effort (or RICE when comparing epics).

## Git conventions (drive automatic tracking)
- Branch: `{feat|fix|spike|chore}/<ID>-<slug>` (printed by `pm start`).
- Commits: Conventional Commits with the ID — `feat(auth): email sign-up DEM-12`; closing commit `... closes DEM-12`.
- **One ID per code commit / PR.** Every `<KEY>-<n>` in a commit message, branch name, PR title or PR body is read by the hooks as "work on this item" (→ `doing`, or `review`/`done` for a PR) — not only `closes`. So mention only the item being worked on. Related items, follow-ups, duplicates or newly found bugs go into the item file (`## Notes`) or the chat reply, never into the commit/PR text.
- **Board changes in their own commit.** Changes to `.pm/` only (new bugs, triage, refinement, sprint planning) are committed separately as `chore(pm): <what>`; such commits may list any IDs — the hooks ignore commits that touch only `.pm/`. Do not mix them into a code commit.
- PR title contains the ID. Hooks then move: commit/branch → `doing`, `closes`/`gh pr create` → `review`, `gh pr merge` → `done`; an epic closes when all its stories are done. Commits that touch only `.pm/` (triage, refinement, planning) never move items; each commit is applied once (state in `.git/gdev-pm-sync.json`), so restoring the board from git or moving an item back by hand is not undone by the next git command. A branch ID counts when you switch to the branch (`pm sync --force` re-applies it).

## AI-SDLC phase map
| Phase | Skill | Output |
|---|---|---|
| Discover / plan | `/gdev:plan` | product brief, epics, roadmap |
| Define | `/gdev:stories`, `/gdev:bug` | specs with AC + AI context |
| Design | `/gdev:design`, `designer` agent | design systems, screens per story, framework themes (`reference/design.md`) |
| Refine | `/gdev:refine` | items that pass DoR, estimated, split |
| Plan iteration | `/gdev:sprint` | sprint goal + commitment within capacity |
| Build & verify | `/gdev:build` | branch, implementation per spec, tests, DoD |
| Track | hooks + `tracker` agent | board mirrors git, drift reported |
| Learn | `/gdev:sprint close` | velocity, mini-retro, improvement item |
