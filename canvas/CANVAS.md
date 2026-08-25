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

## Layout

Thesis-first. Job: what band are we in, and what three fixes move the needle?

- Open header, not a Card: eyebrow `/CODE-READINESS`, repo `H1` (one H1), two Stats, thesis, tertiary source line
- `TodoListCard` of the top 3 to 5 remediations
- One Callout for the next-level gap
- Horizontal `BarChart` of pillar scores, `yMax={100}`, `valueSuffix="%"`, `referenceLines` at 80, caption on `Text size="small"`
- `CollapsibleSection` plus fail-only `Table` per pillar that has fails

No RadarChart. No Overview / Metrics / Details shell. No nested scroll. No Factory score copy.

V2 slop: 2 or more of gradients, emojis, box-shadow, wall of identical cards, rainbow, giant text, decorative borders means redesign.
