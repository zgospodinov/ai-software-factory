---
name: refine
description: Backlog grooming & refinement — check items against the Definition of Ready, resolve open questions, sharpen acceptance criteria, split oversized stories, estimate in story points, prioritise and mark items ready. Use when the user asks to groom, refine, estimate, prioritise, or prepare the backlog/sprint, or when `check` reports items not ready.
argument-hint: "[ID... | --sprint | top <n>]"
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
---

# /gdev:refine

Talk in the user's language. A solo developer is both PO and team: keep sessions short (≤ 5 items per round), decisions explicit.

1. **Select** — deterministic lint first, no file reading yet:
   `node .pm/pm.mjs check` (or `check <ID>` / `check --sprint current`). Default scope: the top 5 backlog items by priority (`ls --status backlog`). The CLI output tells you exactly what each item lacks.
2. **Per item** (only open the item file of the item you are refining — `node .pm/pm.mjs show <ID>`):
   - Resolve `- Q:` questions: batch all questions for this round into ONE AskUserQuestion call (≤ 4), each with concrete options and a recommendation. Record answers in Notes (replace `Q:` with `A:`).
   - Sharpen AC: Given/When/Then, observable, covering happy path + key edge/error cases. Add missing NFRs to AI context.
   - Estimate: Fibonacci points by relative comparison with done items (`ls --status done --type story` gives reference points). State your reasoning in one line (effort · risk · uncertainty). > max points → **split** (propose 2–4 slices with the splitting patterns from `${CLAUDE_PLUGIN_ROOT}/reference/conventions.md`); create the new stories with `add story … --epic`, move the original to `dropped` with a log line pointing to its successors.
   - High uncertainty that blocks estimation → create a timeboxed spike instead of guessing.
   - Dependencies: if blocked by another item/external factor, `block <ID> "reason"`.
3. **Show one summary table** (ID · change · points · prio · verdict) and get one approval; then apply all with a single Bash script: `set <ID> points=<n> prio=<P>` and `move <ID> ready` for items that pass `check <ID>`.
4. **Prioritise** when asked or when the ready queue is unordered: value ÷ effort, risk reduction first, P0 bugs above everything; persist the order with `set <ID> rank=<n>`.
5. Finish with `node .pm/pm.mjs check` + the count of ready points vs capacity (`sprint plan` shows it) and suggest `/gdev:sprint` if enough is ready.
