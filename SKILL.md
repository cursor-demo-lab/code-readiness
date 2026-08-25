---
name: code-readiness
description: Score how ready a repository is for coding agents using local filesystem heuristics from checks/catalog.json, then render a Cursor canvas. Use when the user types /code-readiness, asks about agent readiness, asks "is this repo ready for agents", or wants a canvas readiness report. This is not /doctor.
---

# /code-readiness

Score a **repository root** by walking `checks/catalog.json` with Read, glob, and grep. Fill a report JSON. Copy this repo's canvas template and sidecar. Do not install packages. Do not run `npx`. Do not call external scoring APIs. Do not run an LLM judge. Do not run tests, linters, or scanners.

`/code-readiness` is a deterministic file and config score from this catalog. `/doctor` is a different Cursor rubric. The scores are not comparable. Do not wrap a Doctor canvas.

This skill owns readiness **content** only. When creating or editing the canvas, first read `~/.cursor/skills-cursor/canvas/SKILL.md` and `~/.cursor/skills-cursor/canvas/sdk/index.d.ts`. Defer path, import, design, and link rules to `/canvas`.

## When to use

- `/code-readiness`
- agent readiness
- "is this repo ready for agents"
- canvas readiness report

Do not use this skill for `/doctor` or a qualitative Cursor-health review.

## Recipe

### 1. Resolve the repository root

Use the workspace folder name as the repo name. Walk parents for a `.git` directory if you need a root. Score that root only. The canvas must say repository root only.

### 2. Walk the catalog

Read `checks/catalog.json`. For each criterion, evaluate with Read / glob / grep only. Follow `checks/README.md`.

v1 marks every `requiresLLM` row skipped. Skipped is a third state, excluded from the denominator, not a fail. Keep `v1SkipLLM`.

Optional, same catalog, Node `fs` only, no install:

```bash
node scripts/code-readiness.mjs <repoPath>
```

Do not run npx or third-party scorers.

Cache the JSON report, not the canvas, under `.cursor/cache/readiness/`. Key is repo root + catalog hash + `.git/HEAD` contents. Optional 24h TTL. Do not commit the cache.

If you cannot produce real check results, stop. Do not emit a canvas.

### 3. Score as documented

Keep the catalog's seven pillars and level names. Do not invent a second band.

Levels: 1 Functional, 2 Documented, 3 Standardized, 4 Optimized, 5 Autonomous. Every level is 80% sequential, including L1. L1 is readme, linter, test-files-exist, and type-checker (skip when there is no conventional checker file). license and lock-file are L2. Minimum level is always 1.

`maturity_level` also includes `l1Passed`, `l1Total`, `l2Passed`, `l2Total`, `l1CapReasons`, and `l1Capped`. `l1Capped` is true when the band is 1, the L2 gate already passes, and L1 counted checks still fail (readme, linter, test-files-exist, type-checker). The canvas treats that cap as the primary visual. L1 is 80% of counted L1 rows (4/4, or 3/3 when type-checker skips).

Eval canvas copy must print those engine labels (Functional / Documented / Standardized / Optimized / Autonomous). For a high-% repo still at level 1 because the L2 sequential gate failed (L1 counted checks already pass or type-checker skipped), print "would be L2 except …" naming the remaining L2 fail ids, not `l1CapReasons`. Nest is that shape: L1 4/4, L2 10/13, still Functional — would be L2 except editorconfig, ai-context, env-documentation. `l1CapReasons` is only for when `l1Capped` is true (L2 would pass, L1 counted checks fail). Do not dummy `.editorconfig`.

If the canvas would show Level 5, add the disclaimer. Do not celebrate Autonomous.

`ai-context` looks for `AGENTS.md`, `.github/AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, `.cursorrules`, and `.github/copilot-instructions.md`. `AGENTS.md` counts. Do not add LLM scoring.

Forbidden UI copy: "9 pillars".

Required attribution: local filesystem heuristics from checks/catalog.json; not `/doctor`.

### 4. Copy the template and write the sidecar

Stable filename `code-readiness.canvas.tsx` (kebab-case). Title Case of the stem is Code Readiness. Never spawn `-v2`.

Sidecar is the split for this repeatable report: stable TSX plus `{ "report": payload }` and `useCanvasState("report", null)`. Inline data is the managed `/canvas` default. We use a sidecar because the report reruns.

Import only from `"cursor/canvas"`. Call `useHostTheme()`. Invented exports are the most common runtime failure. After writing `.canvas.tsx` with the write-file tool, the footer `Canvas TypeScript check:` is the ship gate. Fix errors and re-save.

- Also: `LineChart` of pillar %, `computeDAGLayout` L1–L5 SVG, `Link` when `repo_identity` has a URL, `TextInput` fail search, `Checkbox` L1-capped filter.

V2 slop: 2 or more of gradients, emojis, box-shadow, wall of identical cards, rainbow, giant text, decorative borders means redesign. One H1. Two Stats max. No nested scroll. Captions on `Text size="small"`. Defer the rest of design rules to `/canvas` and `canvas/CANVAS.md`.

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
