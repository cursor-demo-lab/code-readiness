# code-readiness

Cursor skill that scores a repository with **local filesystem heuristics** from `checks/catalog.json` and renders the report on a Cursor `/canvas`.

Not `/doctor`.

## How to run

Agents follow `SKILL.md`: resolve the repo root, walk the catalog with Read / glob / grep, fill report JSON, copy the canvas template and sidecar.

Optional helper, Node `fs` only, no package install:

```bash
node scripts/code-readiness.mjs /path/to/repo
```

Do not npm or bun install anything for scoring. Do not run `npx` or third-party scorers. Do not run tests, linters, or scanners. Reading config files is the whole check.

Useful flags:

- `--force` skip the JSON cache
- `--json` print the mapped payload and canvas paths
- `--skip-canvas` score only

The helper prints three chat lines. On desktop the canvas link is the managed `.canvas.tsx` path. On a cloud agent, paste the write-tool save-result URL. Do not invent a URL.

JSON reports cache under `<repo>/.cursor/cache/readiness/` keyed by repo root, catalog hash, and `.git/HEAD`. Optional 24h TTL. Gitignored. Do not commit cache.

Canvas copy rules are in `canvas/CANVAS.md`.

## Honesty

**This catalog.** Deterministic file and config presence. Seven pillars. Five levels: Functional, Documented, Standardized, Optimized, Autonomous. Every level is 80% sequential, including L1. L1 is readme, linter, test-files-exist, and type-checker. license and lock-file are L2. Minimum level 1. Skipped L5 quality checks are a third state and drop out of the denominator. v1 never runs those quality checks.

**`/doctor`.** A qualitative Cursor rubric with a different canvas schema. The scores are not comparable.

`ai-context` looks for `AGENTS.md`, `.github/AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, `.cursorrules`, and `.github/copilot-instructions.md`. `AGENTS.md` is the preferred first-hit when both `AGENTS.md` and `CLAUDE.md` exist. Do not add LLM scoring.

`issue-templates` looks for `.github/ISSUE_TEMPLATE.md` or `.github/ISSUE_TEMPLATE/` (and the matching pull-request template paths). First-hit prefers a form (`bug_report.md` / `Bug_report.yml` / `formatting.md`) over `config.yml` / `config.yaml` when both exist; a config.yml-only tree still passes. Agents need the issue/PR contract to open work the repo already accepts.

`containerization` first-hit prefers `.devcontainer` / `.cursor/environment.json` / a root Dockerfile or compose file. Nested `integration/docker-compose.yml` is not the boot env when a product boot file exists; an integration-only tree still passes.

`setup-script` first-hit prefers the shallowest product-tree file (root `CMakeLists.txt` / `Makefile` / package.json). Nested `support/build.gradle` is not first-hit when a product setup file exists; a support-only tree still passes.

`test-script` first-hit among `*Tests.csproj` / `*Test.csproj` / `*Tests.sln` defers a basename containing `Fuzz` / `fuzz` / `Benchmark` / `bench` when another Tests project exists (`Newtonsoft.Json.Tests.csproj` over `Newtonsoft.Json.FuzzTests.csproj`). A Fuzz-only tree still passes.

`test-framework` first-hit among `vitest.config.*` / `jest.config.*` defers a basename containing `coverage` / `coverage.` / `integration` when another product runner exists (`vitest.config.mts` over `vitest.config.coverage.mts`). A coverage-only or integration-only tree still passes.

`type-checker` first-hit among `tsconfig.json` / `jsconfig.json` defers a path with a whole segment named `test` / `tests` / `spec` / `__tests__` when another tsconfig exists outside those segments (`packages/typescript/tsconfig.json` over `packages/typescript/test/tsconfig.json`). A test-only tree still passes.

If a run would display Level 5, the canvas adds a disclaimer. That band can trip on `bundle-analysis` alone because quality checks are skipped.

## Eval

`eval/` is a later Opus 5 CloudAgent harness. Ground truth is this catalog versus the golden tree. This repository does not run goldens or an LLM judge.
