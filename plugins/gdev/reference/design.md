# gdev design conventions (loaded by /gdev:design and the designer agent)

## Where things live
| What | Where | Notes |
|---|---|---|
| Design systems (browsable) | Claude **Design System** artifacts | one per base/brand system, one per product system |
| Screens, flows, controls in context | Claude **Design** canvas | one canvas per product; pages per epic/flow |
| Source of every artefact | `.design/` in the repo | versioned with the code, re-publishable |
| The index | `.design/registry.json` | single local list of all of the above |

```
.design/
  registry.json              index (below) — keep in sync on every change
  systems/<slug>/project/    files of a Design System artifact (tokens.json, README.md, components/…)
  canvas/<product>/project/  files of the product's Design canvas (canvas.json, <flow>/<NN>-<screen>-<state>.dc.html)
  assets/                    original brand assets (logos, icons, fonts) — copied, never redrawn
  exports/                   generated theme files when the stack has no natural place (else in the app)
  archive/                   superseded material moved here by `audit`, not deleted
```

## registry.json
```json
{
  "v": 1,
  "product": "Acme",
  "stack": { "framework": "react", "styling": ["tailwind@4", "shadcn"], "themeFiles": ["src/app/globals.css"] },
  "systems": [
    { "slug": "acme-base", "title": "Acme Base DS", "scope": "base", "extends": null,
      "url": "https://claude.ai/artifact/…", "source": ".design/systems/acme-base", "themes": ["light", "dark"], "updated": "2026-11-21" },
    { "slug": "acme-app", "title": "Acme App DS", "scope": "product", "extends": "acme-base",
      "url": "…", "source": ".design/systems/acme-app", "themes": ["light", "dark"], "updated": "2026-11-21" }
  ],
  "canvases": [
    { "product": "acme-app", "system": "acme-app", "url": "…", "source": ".design/canvas/acme-app",
      "pages": [{ "id": "ASF-3", "name": "Onboarding" }] }
  ],
  "screens": [
    { "id": "onboarding/02-signup", "item": "ASF-12", "page": "ASF-3", "states": ["default", "error", "loading"],
      "viewports": ["mobile", "desktop"], "artboards": ["onboarding/02-signup-default.dc.html"] }
  ],
  "exports": [
    { "system": "acme-app", "target": "tailwind", "path": "src/app/globals.css", "from": "2026-11-21" }
  ]
}
```
Edit it only through the CLI: `node ${CLAUDE_PLUGIN_ROOT}/bin/design.mjs set <system|canvas|screen|export> <id> k=v …` (`index`, `check`, `scan`, `rm`, `stack`, `init`). Rules: slugs `[a-z0-9-]`; `updated`/`from` ISO dates; a screen without `item` is allowed (flag it in `index`); never store secrets or personal data.

## Naming
- Systems: `<Brand> DS` (base), `<Product> DS` (product). Canvas: `<Product> — UI`.
- Canvas pages: epic ID or flow slug; artboards `<flow>/<NN>-<screen>-<state>.dc.html`; title `<ID> · Screen — state`.
- Tokens: primitives `blue-500`, `gray-50`…; semantic `surface-100`, `ink`, `ink-muted`, `accent`, `accent-ink`, `border`, `focus`, `danger`, `success`, `warning`, `info`; spacing `space-1…8` (4px base); radius `radius-sm|md|lg|full`; shadow `shadow-1…3`; type styles `display`, `h1…h4`, `body`, `body-sm`, `label`, `caption`, `code`.
- Components: PascalCase (`Button`, `TextField`, `DataTable`); variants `primary|secondary|ghost|danger`, sizes `sm|md|lg`.

## Token shape
The Design System artifact reads **lists** (`{"tokens":[{"name","value","usage"}]}`, colors with `themes` and per-theme values) — not DTCG maps. Convert DTCG / Style Dictionary / Figma variables to lists on import; produce DTCG only as an `export`.

## Framework mapping (`export <target>`)
| Target | Output | Notes |
|---|---|---|
| `css` | `tokens.css`: `:root{--color-…}` + `[data-theme="dark"]{…}` and `@media (prefers-color-scheme: dark)` | base for every other target |
| `tailwind` (v4) | `@theme { --color-surface-100: …; --font-sans: …; --radius-md: … }` in the global CSS + dark overrides via `@variant dark` / `.dark{}` | semantic names become utilities (`bg-surface-100`) |
| `tailwind3` | `tailwind.config.*` `theme.extend` referencing `var(--…)`, `darkMode:"class"` | |
| `shadcn` | `globals.css` `:root` / `.dark` vars `--background --foreground --primary --primary-foreground --muted --accent --destructive --border --input --ring --radius` (+ `--chart-*`, `--sidebar-*`) mapped from semantic tokens; oklch values | keep `components.json` untouched |
| `mui` | `theme.ts` `createTheme({ cssVariables:true, colorSchemes:{light:{palette},dark:{palette}}, typography, shape:{borderRadius}, spacing })` | |
| `chakra` (v3) | `theme.ts` `createSystem(defaultConfig, defineConfig({ theme:{ tokens, semanticTokens } }))` | semantic tokens with `_dark` |
| `mantine` | `theme.ts` `createTheme({ colors (10-shade tuples), primaryColor, fontFamily, headings, radius, spacing })` + CSS vars resolver for dark | |
| `radix` | Radix Themes `<Theme accentColor grayColor radius scaling>` + custom CSS vars override | pick nearest Radix scales, report deltas |
| `angular-material` | `_theme.scss` with `mat.theme((color: …, typography: …, density: …))` + system tokens overrides | M3 |
| `vuetify` | `vuetify.ts` `createVuetify({ theme:{ themes:{ light:{colors}, dark:{colors} } } })` | |
| `bootstrap` | `_variables.scss` overrides (`$primary`, `$font-family-sans-serif`, `$border-radius`, `$spacer`) before the import + `[data-bs-theme=dark]` | |
| `dtcg` / `style-dictionary` | `tokens/*.json` DTCG (`$value`, `$type`) + `sd.config` | for multi-platform (iOS/Android) |
| `flutter` / `swiftui` / `compose` | `ThemeData` / `Color` extensions / `MaterialTheme` from the same tokens | on request |

Import (`from-code`) reads the same files in reverse. Prefer the most specific source (shadcn vars over Tailwind defaults over CSS); report conflicts.

## UX quality bar
WCAG 2.2 AA (text 4.5:1, large/UI 3:1, focus visible, target ≥ 24px — 44px for touch), states (default, hover, focus-visible, active, disabled, loading, empty, error, success), responsive (390 / 768 / 1280–1440), content-first copy without lorem ipsum, one primary action per view, consistent spacing from the scale, motion ≤ 200ms with `prefers-reduced-motion`.
