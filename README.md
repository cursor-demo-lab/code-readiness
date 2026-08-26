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

`issue-templates` looks for `.github/ISSUE_TEMPLATE.md` or `.github/ISSUE_TEMPLATE/` (and the matching pull-request template paths). First-hit prefers a form (`bug_report.md` / `Bug_report.yml` / `formatting.md`) over `config.yml` / `config.yaml` and over a pull-request template when both exist; a config.yml-only tree still passes. A PR-template-only tree still passes. Agents need the issue/PR contract to open work the repo already accepts.

`containerization` first-hit prefers `.devcontainer` / `.cursor/environment.json` / a root Dockerfile or compose file. Nested `integration/docker-compose.yml` or `sample/**/docker-compose.yml` is not the boot env when a product boot file exists; an integration-only tree still passes. A sample-only tree still passes. When only deferred hits remain, first-hit names the shallowest leftover.

`setup-script` first-hit prefers the shallowest product-tree file (root `CMakeLists.txt` / `Makefile` / package.json). Nested `support/build.gradle` is not first-hit when a product setup file exists; a support-only tree still passes.

`setup-script` first-hit among `*.csproj` / `*.sln` prefers a product library over a basename containing `Console` / `Demo`, then `*Tests.csproj`, then a basename containing `Fuzz` / `fuzz` / `Benchmark` / `bench` (`Lib.csproj` over `Lib.TestConsole.csproj` / `Lib.Tests.csproj` / `FuzzTests.csproj`). A Console-only tree still passes. A Fuzz-only or Tests-only tree still passes.

`test-script` first-hit among `*Tests.csproj` / `*Test.csproj` / `*Tests.sln` defers a basename containing `Fuzz` / `fuzz` / `Benchmark` / `bench` when another Tests project exists (`Lib.Tests.csproj` over `Lib.FuzzTests.csproj`). A Fuzz-only tree still passes.

`test-framework` first-hit among `vitest.config.*` / `jest.config.*` defers a basename containing `coverage` / `coverage.` / `integration` when another product runner exists (`vitest.config.mts` over `vitest.config.coverage.mts`). A coverage-only or integration-only tree still passes. When the tree is Mix/Elixir-primary (`mix.exs` present and `**/*_test.exs` / `**/*_spec.exs` / `test/test_helper.exs` exist), first-hit prefers those ExUnit files over `jest.config.*` / `vitest.config.*`. When the tree is Rails/RSpec-primary (`Gemfile` present and `**/*_spec.rb` / `**/*_test.rb` / `spec/spec_helper.rb` / `test/test_helper.rb` exist), first-hit prefers those Ruby files over `jest.config.*` / `vitest.config.*`. When the tree is Python-primary (`pyproject.toml` or `pytest.ini` present and `**/test_*.py` / `**/*_test.py` / `**/conftest.py` exist), first-hit prefers those Python files over `jest.config.*` / `vitest.config.*`. When the tree is Java-primary (`pom.xml` or `build.gradle` present and `**/*Test.java` / `**/*Tests.java` exist), first-hit prefers those Java files over `jest.config.*` / `vitest.config.*`. When the tree is C#-primary (`*.csproj` / `*.sln` present and `**/*Tests.cs` / `**/*Test.cs` exist, excluding Fuzz/Benchmark), first-hit prefers those C# files over `jest.config.*` / `vitest.config.*`. A JS-only jest tree still passes. A Mix tree with only jest (no exs tests) still passes on jest. A Rails tree with only jest (no rb tests) still passes on jest. A Python tree with only jest (no py tests) still passes on jest. A Java tree with only jest (no java tests) still passes on jest. A C# tree with only jest (no cs tests) still passes on jest. `test-framework` first-hit also defers a whole path segment named `benchmarks` / `benchmark` / `bench` / `fuzz` / `fuzzing` / `testdata` / `fixtures` / `samples` / `sample` / `examples` / `example` (case-insensitive) when another product test exists (`tests/FooTests.cs` over `benchmarks/LegacyTests.cs`). A benchmark-only tree still passes. `test-framework` also passes on `*Tests.csproj` / `*Test.csproj` (same runners as `test-script`) or a `*.csproj` that contains `xunit` / `nunit` / `MSTest`. First-hit among those Tests projects reuses the `test-script` defer (`Lib.Tests.csproj` over `Lib.FuzzTests.csproj`). A Fuzz-only tree still passes. Product `Foo.csproj` is not a framework.

`linter` first-hit prefers a JS/TS linter (`eslint.config.*` / `biome.json` / `.oxlintrc.json`) over `.golangci.yml` when `detectLanguages` includes typescript/javascript and both exist. A golangci-only tree still passes. A Go-primary tree (`go.mod` without `package.json` / `tsconfig.json`) keeps `.golangci.yml` as first-hit when both exist.

`formatter` first-hit prefers `.formatter.exs` over `prettier.config.*` / `.prettierrc*` / `biome.json` when `mix.exs` and `.formatter.exs` exist. When `Gemfile` and `.rubocop.yml` / `.rubocop.yaml` / `.standard.yml` exist, first-hit prefers those over prettier/biome. When `pyproject.toml` / `ruff.toml` / `.black` exists as a Python formatter hit (`[tool.ruff]` / `[tool.black]`), first-hit prefers those over `prettier.config.*` / `.prettierrc*` / `biome.json`. A Mix tree with only prettier still passes. A Rails tree with only prettier still passes. A Python tree with only prettier still passes. A JS-only prettier tree still passes.

`test-files-exist` first-hit prefers hits matching the detected product language over a sidecar language. When `detectLanguages` includes typescript/javascript, prefer `*.ts` / `*.tsx` / `*.js` / `*.mjs` tests over `*_test.go`. Count still includes Go tests. A Go-only test tree still passes. When the tree is Mix/Elixir-primary (`mix.exs` present and `**/*_test.exs` / `**/*_spec.exs` / `test/test_helper.exs` exist), first-hit prefers those ExUnit files over `*.test.js` / `*.spec.ts` / `*.test.ts`. Count still includes JS tests. A Mix tree with only JS tests still passes. When the tree is Rails/RSpec-primary (`Gemfile` present and `**/*_spec.rb` / `**/*_test.rb` / `test/test_helper.rb` exist), first-hit prefers those Ruby files over `*.test.js` / `*.spec.ts` / `*.test.ts`. Count still includes JS tests. A Rails tree with only JS tests still passes. When the tree is Python-primary (`pyproject.toml` or `setup.py` / `setup.cfg` present and `**/test_*.py` / `**/*_test.py` / `tests/conftest.py` exist), first-hit prefers those pytest/unittest files over `*.test.js` / `*.spec.ts` / `*.test.ts`. Count still includes JS tests. A Python tree with only JS tests still passes. When the tree is Java-primary (`pom.xml` or `build.gradle` / `build.gradle.kts` present and `**/*Test.java` / `**/*Tests.java` exist), first-hit prefers those Java files over `*.test.js` / `*.spec.ts` / `*.test.ts`. Count still includes JS tests. A Java tree with only JS tests still passes. When the tree is C#-primary (`*.csproj` or `*.sln` present and `**/*Tests.cs` / `**/*Test.cs` exist, excluding a basename containing `Fuzz` / `fuzz` / `Benchmark` / `bench` when another C# test exists), first-hit prefers those C# files over `*.test.js` / `*.spec.ts` / `*.test.ts`. Count still includes JS tests. A C# tree with only JS tests still passes. `test-files-exist` first-hit uses the same path-segment defer (`tests/FooTests.cs` over `benchmarks/LegacyTests.cs`). A benchmark-only tree still passes. `test-framework` first-hit that names a test file follows the same preference.

`type-checker` first-hit among `tsconfig.json` / `jsconfig.json` defers a path with a whole segment named `test` / `tests` / `spec` / `__tests__` / `fixtures` / `testdata` when another tsconfig exists outside those segments (`packages/foo/tsconfig.json` over `packages/foo/test/tsconfig.json`, `packages/foo/tsconfig.json` over `fixtures/tsconfig.json`). Among remaining product hits, first-hit ranks repo-root `tsconfig.json` / `jsconfig.json`, then `packages/<name>/tsconfig.json` that is not a plugin/satellite, then other product-tree tsconfigs. A path with a whole segment whose name contains `eslint-plugin`, or equals `plugin` / `plugins` / `hooks`, is not first-hit when a better product tsconfig exists (`packages/foo/tsconfig.json` over `packages/eslint-plugin-foo/tsconfig.json`). A test-only tree still passes. A fixtures-only or testdata-only tree still passes. A plugin-only tree still passes.

If a run would display Level 5, the canvas adds a disclaimer. That band can trip on `bundle-analysis` alone because quality checks are skipped.

## Eval

`eval/` is a later Opus 5 CloudAgent harness. Ground truth is this catalog versus the golden tree. This repository does not run goldens or an LLM judge.
