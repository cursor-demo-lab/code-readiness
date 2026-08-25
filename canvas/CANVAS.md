# Canvas emit

`/code-readiness` ships its own template in this repo. Visualisation only. Do not wrap a Doctor canvas. Do not spawn `code-readiness-v2.canvas.tsx`.

This skill owns readiness content. `/canvas` owns path, import, design, and link rules. First step when creating or editing the canvas: read `~/.cursor/skills-cursor/canvas/SKILL.md` and `~/.cursor/skills-cursor/canvas/sdk/index.d.ts`.

## Files

| File | Role |
| --- | --- |
| `canvas/code-readiness.canvas.tsx` | Template. Import only from `cursor/canvas`. Filename kebab-case. Title Case of the stem is Code Readiness. |
| `code-readiness.canvas.data.json` | Sidecar next to the managed copy. Shape `{ "report": payload }`. |

The canvas reads the sidecar with `useCanvasState("report", null)`. Inline data is the managed-skill default. This report uses a sidecar because it reruns. Cache the JSON report under `.cursor/cache/readiness/`. Never cache the canvas.

## Copy then sidecar

1. If the managed `code-readiness.canvas.tsx` is missing or differs from this template, overwrite it with the template bytes.
2. Write the sidecar `{ "report": payload }` beside it.
3. Re-save the `.canvas.tsx` with the write-file tool. The footer `Canvas TypeScript check:` is the ship gate. Fix errors and re-save. Invented exports are the most common runtime failure.
4. If scoring produced no real results, do not emit a canvas.

`scripts/emit-canvas.mjs` copies bytes. The write-file tool is still required for diagnostics and the save-result URL.

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

- Import **only** from `"cursor/canvas"`.
- Primitives: `Stack`, `Row`, `Grid`, `H1`–`H3`, `Text`, `Stat` (two max), `Table`, `Callout`, `Pill`, `BarChart`, `TodoListCard`, `CollapsibleSection`, `Divider`, `useCanvasState`, `useHostTheme`.
- Call `useHostTheme()` so surfaces, type, and accent follow the host Cursor theme. Do not hardcode hex, rgb, gradients, box-shadow, or emoji chrome in the canvas file.
- Typography comes from the SDK heading and text primitives (`canvasTypography`): H1 24/30 weight 590, H2 18/24, body 14/20, small 12/16.
- Spacing is the canvas scale (`canvasSpacing`) used as `gap`: 8, 12, 16, 24. Do not invent other gaps.
- Radius comes from `canvasRadius` (`sm` / `md` / `lg`) inside the primitives. Do not set custom radius.
- `canvasSpacing` and `canvasRadius` are not public `cursor/canvas` exports. Use the numeric gaps above; do not invent those identifiers as imports.

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

Horizontal `BarChart` of pillar scores, `yMax={100}`, `valueSuffix="%"`, `referenceLines` at 80. Caption on `Text size="small"`.

Colors come from the SDK chart palette via series `tone`, not hex:

- Level 1: `tone="neutral"` (muted)
- Level 2+: `tone="warning"` (accent / orange family)

Do not omit series `tone`. A single series without `tone` rainbows each pillar bar. No `RadarChart`.

## Layout

Thesis-first. Job: what band are we in, and what three fixes move the needle?

- Open header, not a Card: eyebrow `/CODE-READINESS`, one `H1` (repo name), two Stats (level + counted %), thesis `Text`, tertiary source line
- `TodoListCard` of the top 3 to 5 remediations
- One `Callout` for the next-level gap (Level 5 disclaimer uses this same Callout slot)
- Horizontal pillar `BarChart` as specified above
- `CollapsibleSection` plus fail-only `Table` per pillar that has fails

No Overview / Metrics / Details shell. No nested scroll. No wall of identical cards. No invented product-score copy. Keep "not `/doctor`" if it helps disambiguate.

Level labels on the canvas are ours: Foundational, Guided, Structured, Optimized, Autonomous.

V2 slop: 2 or more of gradients, emojis, box-shadow, wall of identical cards, rainbow, giant text, decorative borders means redesign.
