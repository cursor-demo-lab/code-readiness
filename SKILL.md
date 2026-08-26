---
name: code-readiness
description: Score how ready a repository is for coding agents using local filesystem heuristics from checks/catalog.json, then render a Cursor canvas. Use when the user types /code-readiness, asks about agent readiness, asks "is this repo ready for agents", or wants a canvas readiness report. This is not /doctor.
---

# /code-readiness

Score **one repository root** by walking `checks/catalog.json` with Read, glob, and grep. Fill a report JSON. Copy this repo's canvas template and sidecar. That single-repo canvas is the product. The 27-repo eval campaign is the honesty gate for the catalog, not a second canvas and not the chat recipe. Do not install packages. Do not run `npx`. Do not call external scoring APIs. Do not run an LLM judge. Do not run tests, linters, or scanners.

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

Keep the catalog's seven pillars and level names. Do not invent a second band. Pillar 1 display name is Style & Validation; catalog id stays `style-linting`.

Levels: 1 Functional, 2 Documented, 3 Standardized, 4 Optimized, 5 Autonomous. Every level is 80% sequential, including L1. L1 is readme, linter, test-files-exist, and type-checker (skip when there is no conventional checker file). license and lock-file are L2. Minimum level is always 1.

`maturity_level` also includes `l1Passed`, `l1Total`, `l2Passed`, `l2Total`, `l1CapReasons`, and `l1Capped`. `l1Capped` is true when the band is 1, the L2 gate already passes, and L1 counted checks still fail (readme, linter, test-files-exist, type-checker). The canvas treats that cap as the primary visual. L1 is 80% of counted L1 rows (4/4, or 3/3 when type-checker skips).

Print engine labels (Functional / Documented / Standardized / Optimized / Autonomous). For a single repo short of the next sequential gate, the Callout names remaining fail ids from `criterion_results` at `maturity_level.nextLevel`: would be Documented except editorconfig, ai-context. Rank `TodoListCard` items the same way: remaining fails at `nextLevel` first, then other fails. Never lead with a fail that is not on the current gate if gate fails exist. Chat line 2 is criterion + file, gate-first; never lead with `.editorconfig` when `linter` is the L1 fail. `l1CapReasons` only for when `l1Capped` is true. `editorconfig` skips when a prescriptive linter already passes (third state, not a pass); nest stays L2 with `editorconfig` no longer in `l2_fails`. Canvas WHY_FOR_AGENTS: only recommend `.editorconfig` when there is no linter; a linter is the agent-runnable style oracle. Todo ranking is already gate-first; do not lead with `editorconfig` if it is skipped. Do not dummy `.editorconfig`.

The canvas owns the category breakdown. Each of the seven pillar Cards lists remaining counted fails with a fix (criterion id + file) and why it helps agents. Every catalog criterion has a technical `WHY_FOR_AGENTS` sentence. Remaining fails name a concrete file from `OPEN_BY_ID` / `CONCRETE_PATHS` / catalog `anyFiles`, not a blank. Do not dump that breakdown in chat. The 27-repo eval is the honesty gate, not the user-facing report.

If the canvas would show Level 5, add the disclaimer. Do not celebrate Autonomous.

`ai-context` looks for `AGENTS.md`, `.github/AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, `.cursorrules`, and `.github/copilot-instructions.md`. `AGENTS.md` is the preferred first-hit when both `AGENTS.md` and `CLAUDE.md` exist. Do not add LLM scoring.

`issue-templates` looks for `.github/ISSUE_TEMPLATE.md` or `.github/ISSUE_TEMPLATE/` (and the matching pull-request template paths). First-hit prefers a form (`bug_report.md` / `Bug_report.yml` / `formatting.md`) over `config.yml` / `config.yaml` and over a pull-request template when both exist; a config.yml-only tree still passes. A PR-template-only tree still passes. Agents need the issue/PR contract to open work the repo already accepts.

`containerization` first-hit prefers `.devcontainer` / `.cursor/environment.json` / a root Dockerfile or compose file. Nested `integration/docker-compose.yml` or `sample/**/docker-compose.yml` is not the boot env when a product boot file exists; an integration-only tree still passes. A sample-only tree still passes. When only deferred hits remain, first-hit names the shallowest leftover.

`setup-script` first-hit prefers the shallowest product-tree file (root `CMakeLists.txt` / `Makefile` / package.json). Nested `support/build.gradle` is not first-hit when a product setup file exists; a support-only tree still passes.

`setup-script` first-hit among `*.csproj` / `*.sln` defers a basename containing `Fuzz` / `fuzz` / `Benchmark` / `bench` when another csproj exists, and prefers the product project (`Newtonsoft.Json.csproj`) over `*.Tests.csproj` / `*.FuzzTests.csproj` when both exist. A Fuzz-only or Tests-only tree still passes.

`test-script` first-hit among `*Tests.csproj` / `*Test.csproj` / `*Tests.sln` defers a basename containing `Fuzz` / `fuzz` / `Benchmark` / `bench` when another Tests project exists (`Newtonsoft.Json.Tests.csproj` over `Newtonsoft.Json.FuzzTests.csproj`). A Fuzz-only tree still passes.

`test-framework` first-hit among `vitest.config.*` / `jest.config.*` defers a basename containing `coverage` / `coverage.` / `integration` when another product runner exists (`vitest.config.mts` over `vitest.config.coverage.mts`). A coverage-only or integration-only tree still passes. When the tree is Mix/Elixir-primary (`mix.exs` present and `**/*_test.exs` / `**/*_spec.exs` / `test/test_helper.exs` exist), first-hit prefers those ExUnit files over `jest.config.*` / `vitest.config.*`. When the tree is Rails/RSpec-primary (`Gemfile` present and `**/*_spec.rb` / `**/*_test.rb` / `spec/spec_helper.rb` / `test/test_helper.rb` exist), first-hit prefers those Ruby files over `jest.config.*` / `vitest.config.*`. When the tree is Python-primary (`pyproject.toml` or `pytest.ini` present and `**/test_*.py` / `**/*_test.py` / `**/conftest.py` exist), first-hit prefers those Python files over `jest.config.*` / `vitest.config.*`. When the tree is Java-primary (`pom.xml` or `build.gradle` present and `**/*Test.java` / `**/*Tests.java` exist), first-hit prefers those Java files over `jest.config.*` / `vitest.config.*`. When the tree is C#-primary (`*.csproj` / `*.sln` present and `**/*Tests.cs` / `**/*Test.cs` exist, excluding Fuzz/Benchmark), first-hit prefers those C# files over `jest.config.*` / `vitest.config.*`. A JS-only jest tree still passes. A Mix tree with only jest (no exs tests) still passes on jest. A Rails tree with only jest (no rb tests) still passes on jest. A Python tree with only jest (no py tests) still passes on jest. A Java tree with only jest (no java tests) still passes on jest. A C# tree with only jest (no cs tests) still passes on jest. `test-framework` also passes on `*Tests.csproj` / `*Test.csproj` (same runners as `test-script`) or a `*.csproj` that contains `xunit` / `nunit` / `MSTest`. First-hit among those Tests projects reuses the `test-script` defer (`Newtonsoft.Json.Tests.csproj` over `Newtonsoft.Json.FuzzTests.csproj`). A Fuzz-only tree still passes. Product `Foo.csproj` is not a framework.

`linter` first-hit prefers a JS/TS linter (`eslint.config.*` / `biome.json` / `.oxlintrc.json`) over `.golangci.yml` when `detectLanguages` includes typescript/javascript and both exist. A golangci-only tree still passes. A Go-primary tree (`go.mod` without `package.json` / `tsconfig.json`) keeps `.golangci.yml` as first-hit when both exist.

`formatter` first-hit prefers `.formatter.exs` over `prettier.config.*` / `.prettierrc*` / `biome.json` when `mix.exs` and `.formatter.exs` exist. When `Gemfile` and `.rubocop.yml` / `.rubocop.yaml` / `.standard.yml` exist, first-hit prefers those over prettier/biome. When `pyproject.toml` / `ruff.toml` / `.black` exists as a Python formatter hit (`[tool.ruff]` / `[tool.black]`), first-hit prefers those over `prettier.config.*` / `.prettierrc*` / `biome.json`. A Mix tree with only prettier still passes. A Rails tree with only prettier still passes. A Python tree with only prettier still passes. A JS-only prettier tree still passes.

`test-files-exist` first-hit prefers hits matching the detected product language over a sidecar language. When `detectLanguages` includes typescript/javascript, prefer `*.ts` / `*.tsx` / `*.js` / `*.mjs` tests over `*_test.go`. Count still includes Go tests. A Go-only test tree still passes. When the tree is Mix/Elixir-primary (`mix.exs` present and `**/*_test.exs` / `**/*_spec.exs` / `test/test_helper.exs` exist), first-hit prefers those ExUnit files over `*.test.js` / `*.spec.ts` / `*.test.ts`. Count still includes JS tests. A Mix tree with only JS tests still passes. When the tree is Rails/RSpec-primary (`Gemfile` present and `**/*_spec.rb` / `**/*_test.rb` / `test/test_helper.rb` exist), first-hit prefers those Ruby files over `*.test.js` / `*.spec.ts` / `*.test.ts`. Count still includes JS tests. A Rails tree with only JS tests still passes. When the tree is Python-primary (`pyproject.toml` or `setup.py` / `setup.cfg` present and `**/test_*.py` / `**/*_test.py` / `tests/conftest.py` exist), first-hit prefers those pytest/unittest files over `*.test.js` / `*.spec.ts` / `*.test.ts`. Count still includes JS tests. A Python tree with only JS tests still passes. When the tree is Java-primary (`pom.xml` or `build.gradle` / `build.gradle.kts` present and `**/*Test.java` / `**/*Tests.java` exist), first-hit prefers those Java files over `*.test.js` / `*.spec.ts` / `*.test.ts`. Count still includes JS tests. A Java tree with only JS tests still passes. When the tree is C#-primary (`*.csproj` or `*.sln` present and `**/*Tests.cs` / `**/*Test.cs` exist, excluding a basename containing `Fuzz` / `fuzz` / `Benchmark` / `bench` when another C# test exists), first-hit prefers those C# files over `*.test.js` / `*.spec.ts` / `*.test.ts`. Count still includes JS tests. A C# tree with only JS tests still passes. `test-framework` first-hit that names a test file follows the same preference.

`type-checker` first-hit among `tsconfig.json` / `jsconfig.json` defers a path with a whole segment named `test` / `tests` / `spec` / `__tests__` / `fixtures` / `testdata` when another tsconfig exists outside those segments (`packages/typescript/tsconfig.json` over `packages/typescript/test/tsconfig.json`, `packages/foo/tsconfig.json` over `fixtures/tsconfig.json`). A test-only tree still passes. A fixtures-only or testdata-only tree still passes.

Forbidden UI copy: "9 pillars".

Required attribution: local filesystem heuristics from checks/catalog.json; not `/doctor`.

### 4. Copy the template and write the sidecar

Stable filename `code-readiness.canvas.tsx` (kebab-case). Title Case of the stem is Code Readiness. Never spawn `-v2`.

Sidecar is the split for this repeatable report: stable TSX plus `{ "report": payload }` and `useCanvasState("report", null)`. Inline data is the managed `/canvas` default. We use a sidecar because the report reruns.

Import only from `"cursor/canvas"`. Call `useHostTheme()`. Invented exports are the most common runtime failure. After writing `.canvas.tsx` with the write-file tool, the footer `Canvas TypeScript check:` is the ship gate. Fix errors and re-save. Declare each top-level binding once: a second `const WHY_FOR_AGENTS` or `const OPEN_BY_ID` is a module-load `SyntaxError`, so the panel renders nothing and the score never reaches the user.

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
2. Top **gate-ranked** remaining fail as `criterion + file` (first remaining fail at `nextLevel`, or the L1 fail such as `linter` when that gate is still open). Never lead with `.editorconfig` when `linter` is the L1 fail. Do not dummy `.editorconfig`.
3. Markdown link from the save-result URL, or the absolute local `.canvas.tsx` path on desktop

If this is the first `.canvas.tsx` in the workspace canvases directory, add one sentence: a canvas is a live React panel beside chat.

If scoring failed, say so in chat and do not invent scores.
