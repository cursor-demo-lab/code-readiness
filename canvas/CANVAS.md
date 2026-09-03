# Canvas emit

`/code-readiness` ships its own template in this repo. Visualisation only. Do not wrap a Doctor canvas. Do not spawn `code-readiness-v2.canvas.tsx`.

This skill owns readiness content. `/canvas` owns path, import, design, and link rules. First step when creating or editing the canvas: read `~/.cursor/skills-cursor/canvas/SKILL.md` and `~/.cursor/skills-cursor/canvas/sdk/index.d.ts`.

## Files

| File | Role |
| --- | --- |
| `canvas/code-readiness.canvas.tsx` | Template. Import only from `cursor/canvas`. Filename kebab-case. Title Case of the stem is Code Readiness. |
| `code-readiness.canvas.data.json` | Sidecar next to the managed copy. Shape `{ "report": payload }`. |

The canvas reads the sidecar with `useCanvasState("report", null)`. Filter UI uses `useCanvasState("pillarFilter", "all")`, `useCanvasState("failsOnly", true)`, `useCanvasState("failSearch", "")`, and `useCanvasState("l1CappedOnly", false)`. Inline data is the managed-skill default. This report uses a sidecar because it reruns. Cache the JSON report under `.cursor/cache/readiness/`. Never cache the canvas.

## Copy then sidecar

1. If the managed `code-readiness.canvas.tsx` is missing or differs from this template, overwrite it with the template bytes.
2. Write the sidecar `{ "report": payload }` beside it.
3. Re-save the `.canvas.tsx` with the write-file tool. The footer `Canvas TypeScript check:` is the ship gate. Fix errors and re-save. Invented exports are the most common runtime failure.
4. If scoring produced no real results, do not emit a canvas.

`scripts/emit-canvas.mjs` copies bytes. The write-file tool is still required for diagnostics and the save-result URL.

The template is one module, so every top-level `const` / `function` / `class` name appears exactly once. A redeclared binding is a module-load `SyntaxError`, not a type warning: the panel renders nothing and the sidecar, the band, and the score never reach the user. Keep one `WHY_FOR_AGENTS` map and one `OPEN_BY_ID` map. `scripts/evaluate.test.mjs` fails on any duplicate top-level binding in the template and on any `examples/*/code-readiness.canvas.tsx` that no longer matches the template bytes, because `emit-canvas.mjs` copies bytes and a broken template is a broken canvas on every repo.

## Managed paths

Local IDE, 3.1.15 or newer. Write exactly here, no extra folders, no other extensions:

```
/Users/<user>/.cursor/projects/<workspace>/canvases/code-readiness.canvas.tsx
```

Cloud agent. Create:

```
{store}/canvases/new/code-readiness.canvas.tsx
```

After promote, only edit `canvases/<uuid>/source.canvas.tsx`. Never use `~/.cursor/projects/...` on a cloud agent run. Link only the write-tool save-result URL. Never invent a URL.

CLI does not load `/canvas`. Cloud agents only behind `cloud_canvas_skill`, default off.

`CODE_READINESS_CANVAS_DIR` overrides the managed directory. `CODE_READINESS_SURFACE=local` or `cloud` forces a surface.

## Cursor design system

The canvas must look like Cursor, not a custom dashboard. Follow the managed `/canvas` skill and `cursor/canvas` SDK exactly.

Import **only** from `"cursor/canvas"`. Call `useHostTheme()` in the root component so surfaces, type, and accent follow the host Cursor theme. Do not hardcode hex, rgb, gradients, box-shadow, or emoji chrome in the canvas file.

Typography comes from the SDK heading and text primitives (`canvasTypography`): H1 24/30 weight 590, H2 18/24, body 14/20, small 12/16. Spacing is the canvas scale used as `gap`: 8, 12, 16, 24. Radius comes from primitives (`sm` / `md` / `lg`). `canvasSpacing` and `canvasRadius` are not public exports — do not invent those identifiers as imports.

### Primitives this template uses

Hooks: `useHostTheme`, `useCanvasState`, `useCanvasAction`.

Layout and type: `Stack`, `Row`, `Spacer`, `Grid`, `H1`, `H2`, `H3`, `Text`, `Code`, `Divider`.

Chrome: `Pill`, `Button`, `Select`, `Toggle`, `Stat` (two in the header, never a third), `Callout`, `Card` / `CardHeader` / `CardBody` (pillar board only).

Data: `UsageBar`, `Swatch`, `PieChart`, `BarChart`, `TodoListCard`, `CollapsibleSection`, `Table`.

- Also: `LineChart` of pillar %, `computeDAGLayout` L1–L5 SVG, `Link` when `repo_identity` has a URL, `TextInput` fail search, `Checkbox` L1-capped filter.

Do not use `DiffView`, `RadarChart`, hex colors, gradients, or emoji chrome.

Mix open sections with the seven named pillar Cards. CardHeader names come from the catalog: Style & Validation (`style-linting`), Testing, Documentation, Developer Environment, CI/CD, Code Health, Security. Do not wrap the page, stats, charts, or tables in Card.

### Intended look (Cursor Light)

Reference: `Cursor_Light_Theme` / `canvasPaletteLight`. Host theme plus SDK tokens apply these; they must not appear in `code-readiness.canvas.tsx`.

| Token | Hex | Role |
| --- | --- | --- |
| paper | `#f7f7f4` | page / editor surface |
| panel | `#fffdf9` | elevated panel |
| ink | `#26251e` | primary type |
| muted | `#928f82` | tertiary type |
| accent | `#f54e00` | Cursor orange |

Dark hosts resolve through `useHostTheme()` the same way. Do not fork a light-only stylesheet.

### Chart

`LineChart` of pillar scores, `yMax={100}`, `valueSuffix="%"`, `referenceLines` at 80. Series `tone` follows counted score (danger / warning / success). Horizontal `BarChart` is remaining failing counted checks at each sequential level, not the same pillar series. Caption on `Text size="small"`. Do not omit series `tone`. No `RadarChart`.

`PieChart` donut is pass / fail / skip with tones `success` / `danger` / `neutral`. `Swatch` is the pie legend (green / red / gray).

## Layout

Thesis-first. The job is what band, what unblocks the next sequential gate, which files, and why each gap helps coding agents. Callout names remaining fail ids for that gate (would be Documented except editorconfig, ai-context). `l1CapReasons` only when `l1Capped`. `TodoListCard` ranks 3–5 items by gate impact: `nextLevel` fails first, then other fails. Each line is criterion id plus a concrete path from `OPEN_BY_ID` / `OPEN_BY_LANG` / `CONCRETE_PATHS`. The seven pillar Cards are the category breakdown: remaining counted fails, the file to add, and why agents care. Every catalog criterion has a technical `WHY_FOR_AGENTS` sentence (why a coding agent fails without that file). Remaining counted fails name a language-honest file: `failOpenPath` reads `report.languages` (or infers from sibling row messages) and `OPEN_BY_LANG` so a Go fail is `.golangci.yml`, not `eslint.config.js`. `version-pinned` OPEN is `.nvmrc` for JS/TS, `rust-toolchain.toml` for Rust, `go.mod` for Go; `.mise.toml` is the unknown-language fallback only. Remaining-fail cards omit passes: do not list a passing `linter` in Style & Validation, and do not put it on the todo list. AI context OPEN is `AGENTS.md`. Containerization OPEN is `.cursor/environment.json`; `.devcontainer/devcontainer.json` stays in `CONCRETE_PATHS`. Display label for `pre-commit-hooks` is `hooks`; catalog id stays `pre-commit-hooks`. Remaining counted fails name a concrete file from `OPEN_BY_ID` / `OPEN_BY_LANG` / `CONCRETE_PATHS` (catalog `anyFiles` / conventional fix), not a blank. `WHY_FOR_AGENTS_FALLBACK` is unused against the catalog.

- Open header: eyebrow `/CODE-READINESS`, `H1` plus `Row` / `Spacer` / level `Pill`, second `Pill` when `l1Capped` (most important visual), five L1–L5 `Pill`s with the current level `active`, two Stats, counted `UsageBar` (`22 / 36 counted`), thesis, tertiary source line. `Link` the repo name in header `Text` only when `repo_identity` has a URL.
- One `Callout`: L1 cap when present (`l1CapReasons` only then), else Level 5 disclaimer, else would-be-except naming remaining fail ids at `nextLevel`
- `TodoListCard` of the top 3 to 5 gate-ranked fails (criterion id + file); `Button` + `useCanvasAction` `openFile` when `OPEN_BY_ID` / `OPEN_BY_LANG` / `CONCRETE_PATHS` names a path
- Donut + swatch legend
- `Grid` of seven pillar Cards: `CardHeader` is the pillar name plus percent, `CardBody` is that pillar's `UsageBar` then each counted fail (criterion id + file to add, then a technical why-agents-care sentence from `WHY_FOR_AGENTS`). Empty pillar: `No counted gaps.` Named-entity board, not a metric-card wall
- Sequential L1–L5 `computeDAGLayout` SVG, `LineChart` of pillar percentages, horizontal `BarChart` of remaining fails per sequential level
- `Select` + `Toggle` + `TextInput` fail search + `Checkbox` L1-capped then `CollapsibleSection` + `Table` under `H2` / `H3`. Criterion id in `Code`, level in `Pill`. Tables are not inside Cards

L1 capped means the sequential gate holds the band at Functional even though the L2 gate already passes (`l2Passed` / `l2Total`). Reasons are failing L1 ids such as `readme`, `linter`, and `test-files-exist`. Report JSON carries `l2Passed`, `l2Total`, `l1CapReasons`, and `l1Capped`. The canvas does not recompute the 80% gate.

No Overview / Metrics / Details shell. No nested scroll. No invented product-score copy. Keep "not `/doctor`" if it helps disambiguate.

Level labels on the canvas are ours: Functional, Documented, Standardized, Optimized, Autonomous.

V2 slop: 2 or more of gradients, emojis, box-shadow, wall of identical cards, rainbow, giant text, decorative borders means redesign.
