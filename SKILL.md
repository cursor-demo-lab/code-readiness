---
name: code-readiness
description: Score how ready a repository is for coding agents using local filesystem heuristics from checks/catalog.json, then render a Cursor canvas. Use when the user types /code-readiness, asks about agent readiness or Kodus, asks "is this repo ready for agents", or wants a canvas readiness report. This is not /doctor, not Factory Agent Readiness, and does not run @kodus/agent-readiness.
---

# /code-readiness

Score a **repository root** by walking `checks/catalog.json` with Read, glob, and grep. Fill a report JSON. Copy this repo's canvas template and sidecar. Do not install packages. Do not run `npx`. Do not call Factory APIs. Do not run an LLM judge. Do not run tests, linters, or scanners.

`/code-readiness` is a deterministic file and config score from this catalog. `/doctor` is a different Cursor rubric. The scores are not comparable. Do not wrap a Doctor canvas.

This skill owns readiness **content** only. When creating or editing the canvas, first read `~/.cursor/skills-cursor/canvas/SKILL.md` and `~/.cursor/skills-cursor/canvas/sdk/index.d.ts`. Defer path, import, design, and link rules to `/canvas`.

## When to use

- `/code-readiness`
- agent readiness
- Kodus
- "is this repo ready for agents"
- canvas readiness report

Do not use this skill for `/doctor`, Factory Agent Readiness, or a qualitative Cursor-health review.

## Recipe

### 1. Resolve the repository root

Use the workspace folder name as the repo name. Walk parents for a `.git` directory if you need a root. Score that root only. The canvas must say repository root only.

### 2. Walk the catalog

Read `checks/catalog.json`. For each criterion, evaluate with Read / glob / grep only. Follow `checks/README.md`.

v1 marks every `requiresLLM` row skipped. Skipped is a third state, excluded from the 80% denominator, not a fail.

Optional, same catalog, Node `fs` only, no install:

```bash
node scripts/code-readiness.mjs <repoPath>
```

If Kodus-the-CLI or `@kodus/agent-readiness` is on the machine, do not run it.

Cache the JSON report, not the canvas, under `.cursor/cache/readiness/`. Key is repo root + catalog hash + `.git/HEAD` contents. Optional 24h TTL. Do not key cache on a Kodus version. Do not commit the cache.

If you cannot produce real check results, stop. Do not emit a canvas.

### 3. Score as documented

Keep the catalog's seven pillars and level names. Do not invent a second band.

Levels: 1 Foundational, 2 Guided, 3 Structured, 4 Optimized, 5 Autonomous. Gate: 80% of **this** level's non-skipped criteria, sequential. Minimum level is always 1.

If the canvas would show Level 5, add the disclaimer. Do not celebrate Autonomous.

`ai-context` does not check `AGENTS.md`. If that file exists and `ai-context` failed, mention it outside the denominator.

Forbidden UI copy: "Factory score", "Factory-compatible", "Level 3 Standardized", "9 pillars".

Required attribution: local filesystem heuristics inspired by Kodus and Factory Agent Readiness; not a Factory report; not `/doctor`; not running `@kodus/agent-readiness`.

### 4. Copy the template and write the sidecar

Stable filename `code-readiness.canvas.tsx` (kebab-case). Title Case of the stem is Code Readiness. Never spawn `-v2`.

Sidecar is the split for this repeatable report: stable TSX plus `{ "report": payload }` and `useCanvasState("report", null)`. Inline data is the managed `/canvas` default. We use a sidecar because the report reruns.

Import only from `"cursor/canvas"`. Invented exports are the most common runtime failure. After writing `.canvas.tsx` with the write-file tool, the footer `Canvas TypeScript check:` is the ship gate. Fix errors and re-save.

V2 slop: 2 or more of gradients, emojis, box-shadow, wall of identical cards, rainbow, giant text, decorative borders means redesign. One H1. No nested scroll. Captions on `Text size="small"`. Defer the rest of design rules to `/canvas`.

**Local IDE, 3.1.15 or newer.** Write exactly:

```
/Users/<user>/.cursor/projects/<workspace>/canvases/code-readiness.canvas.tsx
```

Sidecar: `code-readiness.canvas.data.json` beside it. No mkdir, no subfolders, no other extensions.

**Cloud agent.** Create:

```
{store}/canvases/new/code-readiness.canvas.tsx
```

After promote, only edit `canvases/<uuid>/source.canvas.tsx`. Never use `~/.cursor/projects/...` on a cloud agent run. Link only the write-tool save-result URL. Never invent a URL.

CLI does not load `/canvas`. Cloud agents only behind `cloud_canvas_skill`, default off.

See `canvas/CANVAS.md`.

### 5. Chat: three lines plus the canvas link

1. Level and score
2. Top fix
3. Markdown link from the save-result URL, or the absolute local `.canvas.tsx` path on desktop

If this is the first `.canvas.tsx` in the workspace canvases directory, add one sentence: a canvas is a live React panel beside chat.

If scoring failed, say so in chat and do not invent scores.
