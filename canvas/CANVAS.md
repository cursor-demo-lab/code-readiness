# Canvas emit

`/code-readiness` ships a Kodus-specific template. Do not wrap `Doctor-report.canvas.tsx`. Do not spawn `code-readiness-v2.canvas.tsx`.

## Files

| File | Role |
| --- | --- |
| `canvas/code-readiness.canvas.tsx` | Template. Import only from `cursor/canvas`. |
| `code-readiness.canvas.data.json` | Sidecar written next to the managed copy. Shape `{ "report": payload }`. |

The canvas reads the sidecar with `useCanvasState("report", null)`. Cache the Kodus JSON under `.cursor/cache/readiness/`. Never cache the canvas.

## Copy then sidecar

1. If the managed `code-readiness.canvas.tsx` is missing or differs from this template, overwrite it with the template bytes.
2. Write the sidecar `{ "report": payload }` beside it.
3. If Kodus fails to produce JSON, do not emit a canvas.

`scripts/emit-canvas.mjs` does this. `scripts/code-readiness.mjs` runs Kodus, maps the JSON, then emits.

## Managed paths

Local IDE, 3.1.15 or newer. Write exactly here, no extra folders, no other extensions:

```
/Users/<user>/.cursor/projects/<workspace>/canvases/code-readiness.canvas.tsx
```

The IDE only detects that directory (`isManagedCanvasPath`). Do not mkdir. Do not use another extension.

Cloud agent, current main. Do not use the local `~/.cursor` path.

```
{userStore}/canvases/new/code-readiness.canvas.tsx
```

Type-check promotes that file to `{userStore}/canvases/<uuid>/source.canvas.tsx`. Chat link:

```
https://cursor.com/canvas/<storeId>/<canvasId>
```

`userStore` is the Current agent's store. In this environment that is often `/cursor/stores/self`. `storeId` is that folder name. `canvasId` is the promoted uuid when it exists. Until promotion, keep the `canvases/new/` file path in chat as well.

CLI does not load `/canvas`. Cloud agents only behind `cloud_canvas_skill`, which defaults off.

Override the managed directory with `CODE_READINESS_CANVAS_DIR` when the script cannot resolve it. Set `CODE_READINESS_SURFACE=local` or `cloud` to force a surface.

## Layout

Thesis-first. Job: what band are we in, and what three fixes move the needle?

- Open header, not a Card: eyebrow `/CODE-READINESS`, repo `H1`, two Stats, thesis, tertiary source line
- `TodoListCard` of the top 3 to 5 Kodus remediations
- One Callout for the next-level gap
- Horizontal `BarChart` of Kodus pillar scores, `yMax={100}`, `valueSuffix="%"`, `referenceLines` at 80
- `CollapsibleSection` plus fail-only `Table` per pillar that has fails

No RadarChart. No Overview / Metrics / Details shell. No Factory score copy.
