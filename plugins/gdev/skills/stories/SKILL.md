---
name: stories
description: Break an epic (or a feature description) into INVEST user stories with Given/When/Then acceptance criteria and AI-ready implementation context, written to the gdev board. Use when the user wants user stories, to decompose/split an epic or feature, or to write a single story.
argument-hint: "<epic ID | feature description>"
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# /gdev:stories

Talk in the user's language; write item files in the language the project already uses (default English).

1. **Context, minimal**: `node .pm/pm.mjs show <epic>` and `node .pm/pm.mjs ls --epic <epic>` (to avoid duplicates). Read `.pm/product.md` only if users/personas are unknown. For code-touching stories, check the codebase cheaply (graphify query if `graphify-out/` exists, else targeted Grep) — just enough to name modules in "AI context".
2. **Draft the slice plan** — vertical slices that each deliver observable user value end-to-end (UI → API → data), walking skeleton first. Apply splitting patterns (workflow steps, business-rule variations, happy path → edge cases, data variations, CRUD, defer NFRs). Each story must be INVEST: Independent, Negotiable, Valuable, Estimable, Small (≤ 8 points), Testable.
3. **Show one compact table** before writing: # · title · value (so that…) · rough size (S/M/L) · depends on. Ask once (AskUserQuestion: `Create all (Recommended)` · `Create, but let me edit titles` · `Rework the split`).
4. **Write**: one Bash script with `node .pm/pm.mjs add story "<title>" --epic <epic> --prio <P>` lines (capture IDs from output). Then fill each `.pm/items/<ID>.md` with Write, keeping the template headings:
   - **Story**: As a <specific role>, I want <capability>, so that <benefit>.
   - **Acceptance criteria**: 2–6 `- [ ] Given … when … then …` covering the happy path, key edge cases, error handling. Observable, no implementation details.
   - **Notes**: anything unclear as `- Q: …` (refinement will resolve them — do not guess on business rules).
   - **AI context**: modules/files it likely touches, constraints/NFRs (security, performance, a11y), explicit out-of-scope. This is the spec the coding agent gets — concrete, short.
   - **Tasks**: optional, only when obvious.
5. Do not estimate here unless the user asks — estimation happens in `/gdev:refine`. Finish with `node .pm/pm.mjs check` output (it lists what is still missing) and suggest `/gdev:refine`.

Single story: same rules, skip the table, write directly.
