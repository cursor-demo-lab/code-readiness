---
name: code-readiness
description: Score how ready a repository is for coding agents using local Kodus Agent Readiness @0.1.3 and render a Cursor canvas. Use when the user types /code-readiness, asks about agent readiness or Kodus, asks "is this repo ready for agents", or wants a canvas readiness report. This is not /doctor and not Factory Agent Readiness.
---

# /code-readiness

Score a **repository root** with pinned local `@kodus/agent-readiness@0.1.3`, then render a Kodus canvas. Do not invent a second scoring model. Do not call Factory APIs. Do not run an LLM judge on this path. v1 never runs Kodus AI.

`/code-readiness` is a deterministic Kodus file and config score. `/doctor` is a qualitative Cursor rubric with a different canvas schema. The scores are not comparable. Do not wrap `Doctor-report.canvas.tsx`.

## When to use

- `/code-readiness`
- agent readiness
- Kodus
- "is this repo ready for agents"
- canvas readiness report

Do not use this skill for `/doctor`, Factory Agent Readiness, or a qualitative Cursor-health review.

## Recipe

### 1. Resolve the repository root

Use the workspace git toplevel. If git is missing, use the workspace root. Score that root only. Do not score a nested package as a substitute. The canvas must say repository root only.

### 2. Run pinned Kodus, AI stripped

Prefer the skill script:

```bash
node scripts/code-readiness.mjs <repoPath>
```

That script is the default command path. If you cannot run it, invoke Kodus yourself with this exact command and nothing else:

```bash
npx --yes @kodus/agent-readiness@0.1.3 <repoPath> --format json --ci --no-web
```

Hard rules:

- Pin **0.1.3**. Never `@latest`.
- `--no-web` is mandatory. Default Kodus starts a web server and hangs forever. `--format json` does not disable web.
- `--ci` and `--yes` keep the run non-interactive.
- Force AI off. There is no `--no-ai`. Unset `OPENAI_API_KEY` and `KODUS_API_KEY` on the child. Never inherit them. If `.kodus-readiness.yml` has `aiEnabled: true`, the script flips it to `false` for the child and restores the file after. Do not pass `--ai`.
- Do not run Opus or any other LLM judge here.

Cache the JSON report, not the canvas, under `.cursor/cache/readiness/`. The cache key is repo root + `0.1.3` + `--format json --ci --no-web` + config hash + `HEAD` + `git status --porcelain`. TTL is 24 hours. Do not commit the cache.

If Kodus does not print JSON, stop. Do not emit a canvas.

### 3. Map the JSON as Kodus

Keep Kodus levels, pillar scores, skipped AI checks, and recommendations. Do not recompute a second band. Skipped AI checks are a third state. They are excluded from the 80% denominator. They are not fails.

Levels: 1 Foundational, 2 Guided, 3 Structured, 4 Optimized, 5 Autonomous. Gate: 80% of **this** level's non-skipped criteria, sequential. Minimum level is always 1.

v1 never runs AI. If the canvas would show Level 5, add the disclaimer from the mapper. Do not celebrate Autonomous.

Kodus `ai-context` looks for `CLAUDE.md`, `.cursor/rules`, `.cursorrules`, and `.github/copilot-instructions.md`. It does not check `AGENTS.md`. If `AGENTS.md` exists and `ai-context` failed, mention that on the canvas. Keep that overlay outside the Kodus 80% denominator.

Forbidden UI copy: "Factory score", "Factory-compatible", "Level 3 Standardized", "9 pillars".

Required attribution: engine name + `@0.1.3` + "inspired by Factory Agent Readiness; not a Factory report."

### 4. Copy the template and write the sidecar

Template: `canvas/code-readiness.canvas.tsx`. Stable filename. Never spawn `-v2`.

The canvas is a live React app in a Canvas tab. Emit React TSX. There is no JSON schema for the canvas body. Import only from `"cursor/canvas"`. Embed data through the sidecar `{ "report": payload }` and `useCanvasState("report", null)`. No `fetch()`, no network.

**Local IDE, 3.1.15 or newer.** Write exactly:

```
/Users/<user>/.cursor/projects/<workspace>/canvases/code-readiness.canvas.tsx
```

Sidecar: `code-readiness.canvas.data.json` in that same directory. No mkdir, no subfolders, no other extensions. The IDE only detects that directory (`isManagedCanvasPath`). If the file is missing or the template changed, overwrite it. Then write the sidecar.

**Cloud agent.** Do not use the local `~/.cursor` path. Write:

```
{userStore}/canvases/new/code-readiness.canvas.tsx
```

Type-check promotes that file to `{userStore}/canvases/<uuid>/source.canvas.tsx`. Link `https://cursor.com/canvas/<storeId>/<canvasId>`. `userStore` is the Current agent's store.

CLI does not load `/canvas`. Cloud agents only behind `cloud_canvas_skill`, default off.

`scripts/code-readiness.mjs` copies the template and writes the sidecar. `CODE_READINESS_CANVAS_DIR` overrides the managed directory. See `canvas/CANVAS.md`.

### 5. Chat: three lines plus the canvas link

1. Kodus level and score
2. Top fix
3. Markdown link to the canvas: absolute local file, or the cloud URL

If this is the first `.canvas.tsx` in the workspace canvases directory, add one sentence: a canvas is a live React panel beside chat.

If Kodus failed, say so in chat and do not invent scores.
