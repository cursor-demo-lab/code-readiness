# Check catalog

`checks/catalog.json` is the scoring spec. The agent evaluates every criterion with Read, glob, and grep only. Do not install packages. Do not run `npx`. Do not run tests, linters, or scanners.

v1 skips `requiresLLM` criteria. Those are a third state: skipped, excluded from the denominator, not fails. Keep `v1SkipLLM`.

## How to evaluate a row

1. If `requiresLLM` is true, mark skipped.
2. Else look for files in `anyFiles` / `anyGlobs` (file or directory presence).
3. Else read listed files and grep `fileContains` / `fileRegex` / `ciGrep`.
4. Else apply special fields: `minBytes`, `tsconfigStrict`, `languagesPass`, `packageJsonPath`, `makefileTarget`, `lockFileFreshDays`, `testFiles`, `ciFiles`.
5. Presence of config is a pass. Never execute the tool the config describes.

`ai-context` looks for `AGENTS.md`, `.github/AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, `.cursorrules`, `.github/copilot-instructions.md`, `GEMINI.md`, `.github/instructions/**/*.md`, `.windsurfrules`, and `WARP.md`. `AGENTS.md` counts. Do not add LLM scoring.

`linter` is language-native. ESLint and Biome are both first-class JS/TS linters: a root `biome.json` / `biome.jsonc` or package.json `"biome"` passes without ESLint, and `eslint.config.*` / `.eslintrc*` / package.json `"eslint"` passes without Biome. Go uses golangci-lint (`.golangci.yml` / `.yaml` / `.toml` / `.json`); a Makefile or `go.mod` mention is not enough. Formatters (Prettier, Black, rustfmt, gofmt, clang-format, dprint, `.clang-format`) are not linter hits.

Go, Rust, Java, Kotlin, C#, and Swift auto-pass `type-checker` when a language manifest is present (`go.mod`, `Cargo.toml`, `pom.xml`/`build.gradle`, `build.gradle.kts`, `*.csproj`/`global.json`, `Package.swift`); stray `*.go` files do not count. Go, Rust, and C# auto-pass `formatter` the same way. That is a language default, not a subprocess. `formatter` also passes on a root `.dprint.json`, `.dprint.jsonc`, `dprint.json`, `.clang-format`, `.swift-format` / `.swiftformat`, or `.scalafmt.conf`. `type-checker` passes on a root `tsconfig.json` (existence, not `strict: true`) or mypy/pyright files, and skips (drops from the L1 denominator) when none of those apply: JavaScript without `tsconfig.json`, Python without mypy/pyright / `[tool.mypy]` / `[tool.pyright]`, and similar. `test-framework` package.json `fileContains` matches unquoted `node --test` so compound scripts like `node --test && …` count; quoted `"node --test"` misses those because after `--test` comes space then `&&`, not a closing quote. Rust `test-framework` needs `tests/**/*.rs`, `**/*_test.rs`, or Cargo.toml `[[test]]` — `Cargo.toml` alone is `test-script` (`cargo test`), not a framework hit.

`lock-file` also accepts `uv.lock`, `pdm.lock`, and `npm-shrinkwrap.json`. If none of the listed lock files exist and `detectLanguages` says Java, C, C++, Haskell, Python, JavaScript, or TypeScript, skip the check (drop it from the denominator). Python and JS/TS libraries without a committed lock are skipped, not failed; a committed `uv.lock` or `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` / `bun.lock` / `bun.lockb` still counts. `pyproject.toml` is not a lockfile. Otherwise fail. `setup-script` also passes on package.json `scripts.test`, `scripts.lint`, or `scripts.build`, not only `scripts.dev`. Makefile `setup|install` and a root Makefile still pass. `test-script` also passes on `scripts/test` / `scripts/test.sh` / `scripts/test-*`, `tox.ini` / `tox.toml` / `noxfile.py` / `pytest.ini`, or pyproject `[tool.pytest` / `[tool.tox` / `[tool.hatch.envs`; `setup-script` also passes on `scripts/install` / `scripts/install.sh` / `scripts/install-*`, `setup.py` / `setup.cfg`, or pyproject `[build-system]`.

`env-documentation` skips when there is no `.env.example` / `.env.template` / `.env.sample` and the repository root has no `.env`, `.env.*`, `docker-compose.yml` / `docker-compose.yaml`, `compose.yml` / `compose.yaml`, or `.envrc`; nested `sample/**` / `examples/**` / `integration/**` compose or env files do not count. Fail only when those root env or compose files exist without an example. `version-pinned` also passes when `setup.py` contains `python_requires`; ruff `target-version` is not a runtime pin.

## Levels

1 Functional, 2 Documented, 3 Standardized, 4 Optimized, 5 Autonomous.

Every level clears at 80% of its own counted rows, including L1. L1 Functional is readme, linter, test-files-exist, and type-checker (skip when there is no conventional checker file). license and lock-file are L2. Minimum level is 1. Non-AI counts: L1=4 need 4 (3/3 when type-checker skips), L2=13 need 11, L3=9 need 8, L4=8 need 7, L5=1 need 1 (`bundle-analysis`). If the report would show Level 5, add the disclaimer. Do not celebrate Autonomous. Eval canvas copy prints those engine labels. A high-% repo still at level 1 because the L2 sequential gate failed gets a "would be L2 except …" line naming remaining L2 fail ids (not `l1CapReasons`; that field is only when `l1Capped` is true). Do not dummy `.editorconfig`.

Optional helper: `node scripts/code-readiness.mjs <repo>` applies this same catalog with Node `fs` only. No npm install.
