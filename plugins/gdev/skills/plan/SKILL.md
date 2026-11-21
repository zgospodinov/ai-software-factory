---
name: plan
description: Turn an idea or plan into a product brief, epics and a Now/Next/Later roadmap, or add/change roadmap items. Use when the user has a product or feature idea, wants to plan a product/service, define vision and goals, add something to the ROADMAP, or reprioritise the roadmap.
argument-hint: "[idea text | roadmap add <title> | roadmap]"
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
---

# /gdev:plan

Talk in the user's language. CLI: `node .pm/pm.mjs` (if `.pm/` is missing, run the `/gdev:setup` flow first).

## Roadmap shortcuts (no interview)
- `roadmap` → run `node .pm/pm.mjs roadmap` and show it.
- `roadmap add <title>` → ask only what is missing (horizon now/next/later; outcome/goal in one line), then `roadmap add "<title>" --horizon <h> --goal "<goal>"`. If it is a sizeable outcome, offer to create its epic (`add epic … --horizon <h>`) and link it (`roadmap set R-n epic=<ID>`).
- Moving/reprioritising: `roadmap set R-n horizon=next`; shipped items → `horizon=shipped`.

## Full planning flow (idea → plan)
1. **Read cheaply**: `node .pm/pm.mjs status` and the headings of `.pm/product.md`. Do not reread a brief you have in context.
2. **Discovery interview** — at most 2 rounds of AskUserQuestion (≤ 4 questions each), only for what you cannot infer: target user & problem, the one outcome that defines success (metric), constraints (time, budget, stack, compliance), explicit non-goals. Offer concrete options with a recommended default; never ask open-ended lists of questions in chat.
3. **Product brief**: fill `.pm/product.md` (≤ 80 lines, keep the template headings). Be specific and falsifiable — metrics with targets, risks with mitigations. List assumptions explicitly; mark the riskiest one.
4. **Slice into epics** (3–7 for an MVP): each epic is an outcome, not a component ("Visitors can create an account", not "Auth module"). Order by value and risk: put the riskiest assumption first (validate early), walking-skeleton/end-to-end slice before breadth. Add a spike for any unknown that blocks estimation.
5. **Roadmap**: Now = the MVP epics that prove the core value; Next = growth/hardening; Later = ideas. Show the proposal as one table (epic · outcome · horizon · why now) and get one approval (AskUserQuestion: `Create as proposed (Recommended)` · `Adjust`).
6. **Write** in one Bash script: `add epic "<title>" --prio P1 --horizon now` per epic, then `roadmap add … --epic <ID>`; fill each epic file's Goal / Success metric / Scope with Write. Log the decision: `node .pm/pm.mjs log "plan: <one line>"`.
7. Close with `node .pm/pm.mjs roadmap` and suggest the next step: `/gdev:stories <epic ID>` for the first Now epic.

Principles: outcomes over output, smallest valuable increment, decide what NOT to build, no dates without capacity data (use horizons; sprints give forecasts).
