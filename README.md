# gospodinov.dev AI-DLC

Лек, стандартизиран комплект за **product management на софтуерни продукти за един разработчик**, изграден като плъгини за Claude Code / Claude Desktop. Покрива пълния цикъл: идея → product brief → roadmap → епики → user stories → grooming & refinement → спринт → имплементация → проследяване на статуса, както и **бъгове/дефекти** и **ROADMAP**.
Техническото име на плъгина е `gdev`, затова командите са `/gdev:<команда>`.

| Плъгин | Какво дава |
|---|---|
| `gdev` (gospodinov.dev AI-DLC) | 8 skills (`/gdev:*`), агент `tracker`, детерминистично CLI `pm.mjs`, hooks за автоматично проследяване от git |
| `gdev-ui` | UI мод за Claude Desktop: панел с борда (Sprint / Backlog / Bugs / Roadmap), лента над промпта със спринт прогреса, status line, команда `/gdev-board` |

## Инсталация (веднъж, работи за всички проекти)

```powershell
claude plugin marketplace add C:\F\code\ai-software-factory
```
```powershell
claude plugin install gdev@gospodinov-dev-ai-dlc
```
```powershell
claude plugin install gdev-ui@gospodinov-dev-ai-dlc
```
Нужен е Node.js (≥ 18) в PATH. След това във всяко репо: `/gdev:setup`.

## Команди

| Команда | SDLC фаза | Какво прави |
|---|---|---|
| `/gdev:setup [new\|adopt\|audit]` | Setup | Конфигурационен диалог за нов проект; одит и **реструктуриране на съществуващ** (docs, BACKLOG/ROADMAP файлове, GitHub issues, TODO) по стандарта |
| `/gdev:plan [идея \| roadmap add …]` | Discover / Plan | Интервю → product brief → епики → Now/Next/Later roadmap; добавяне/пренареждане на точки в ROADMAP |
| `/gdev:stories <епик>` | Define | INVEST user stories, Given/When/Then AC, „AI context“ (спецификация за кодиращия агент) |
| `/gdev:bug <описание> \| triage \| <ID> investigate` | Define / Triage | Стандартен bug report (repro, expected/actual, среда, severity S1–S4 → приоритет), дубликати, планиране, root cause |
| `/gdev:refine [ID…]` | Grooming & refinement | DoR проверка, отворени въпроси, по-добри AC, оценка (Fibonacci), разделяне на големи истории, приоритизация |
| `/gdev:sprint [plan\|start\|review\|close]` | Iteration planning | Цел на спринта, ангажимент по капацитет (velocity), mid-sprint review, затваряне + мини ретро |
| `/gdev:build <ID\|next>` | Build & verify | Старт → branch → имплементация по спецификацията, test-first, DoD, commit/PR с ID |
| `/gdev:status [next\|standup\|board\|tree\|roadmap\|bugs]` | Track | Кратък статус (на Haiku — евтино) |
| агент `tracker` | Track | Синхронизира борда с git/PR-и, мести статуси, сигнализира WIP/stale/blocked/риск за спринта (на Haiku) |

## Модел на данните (в репото на проекта, версиониран с кода)

```
.pm/
  config.json      ключ (напр. ASF), спринт, капацитет, WIP, DoR/DoD
  board.json       индекс: items, sprints, roadmap — пипа се САМО през CLI
  items/ASF-12.md  спецификацията на всеки item (story / bug / epic / spike / chore)
  product.md       product brief (≤ 80 реда)
  log.md           activity log (append-only, автоматична ротация)
  pm.mjs           локално копие на CLI-то (за hooks, UI и агента)
  templates/       шаблони, може да се персонализират за проекта
```
Статуси: `idea → backlog → ready → doing → review → done` (+ `dropped`, флаг `blocked`). Пълните конвенции: [plugins/gdev/reference/conventions.md](plugins/gdev/reference/conventions.md).

## Как се пестят токени

1. **Детерминистично CLI вместо LLM** — статуси, DoR проверка, капацитет, velocity, roadmap, git синхронизация се правят от `pm.mjs` с компактен изход от няколко реда; моделът никога не чете/пише целия `board.json`.
2. **Hooks без модел** — `git commit` / `gh pr create` / `gh pr merge` автоматично местят задачите (`ASF-12` в branch/commit → doing, `closes ASF-12` → review, merge → done; епикът се затваря сам). Комити, които пипат само `.pm/` (триаж, refinement, планиране), не местят задачи; всеки комит се прилага само веднъж, така че ръчно върната задача или борд, възстановен от git, не се „пресинхронизира“.
3. **Прогресивно зареждане** — всеки skill е кратък; конвенциите се зареждат само при нужда; item файл се чете само за задачата, по която се работи.
4. **Евтини модели където стига** — `/gdev:status` и `tracker` вървят на Haiku.
5. **Бюджети и ротация** — product.md ≤ 80 реда, log.md се ротира в `.pm/archive/`.
6. **SessionStart** инжектира 3–6 реда статус само в проекти с `.pm/` (нула разход в останалите).
7. **UI-то чете файла директно** — бутоните в панела (→ status) викат CLI-то, без нито един токен.

## Git конвенции (за автоматичното проследяване)

- Branch: `feat/ASF-12-kratko-ime` (отпечатва се от `pm start`)
- Commit: `feat(auth): email sign-up ASF-12`, последният — `… closes ASF-12`
- PR заглавие съдържа ID-то
- **Едно ID на код-комит / PR.** Hook-ът чете всяко `ASF-n` в съобщението, клона, заглавието и описанието на PR като „работа по задачата“, не само `closes`. Свързани задачи, follow-up-и и новооткрити бъгове се записват във файла на задачата, не в комита.
- Промени само по борда (`.pm/`: нови бъгове, триаж, refinement, спринт) се комитват отделно като `chore(pm): …`. В тях може да има произволни ID-та, защото hook-ът ги пропуска.

## CLI (по желание и ръчно)

```powershell
node .pm/pm.mjs help
```
