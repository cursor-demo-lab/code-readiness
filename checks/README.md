# Check catalog

`checks/catalog.json` is the scoring spec. The agent evaluates every criterion with Read, glob, and grep only. Do not install packages. Do not run `npx`. Do not run tests, linters, or scanners.

v1 skips `requiresLLM` criteria. Those are a third state: skipped, excluded from the denominator, not fails. Keep `v1SkipLLM`.

## How to evaluate a row

1. If `requiresLLM` is true, mark skipped.
2. Else look for files in `anyFiles` / `anyGlobs` (file or directory presence).
3. Else read listed files and grep `fileContains` / `fileRegex` / `ciGrep`.
4. Else apply special fields: `minBytes`, `tsconfigStrict`, `languagesPass`, `packageJsonPath`, `makefileTarget`, `lockFileFreshDays`, `testFiles`, `ciFiles`.
5. Presence of config is a pass. Never execute the tool the config describes.

`ai-context` looks for `AGENTS.md`, `.github/AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, `.cursorrules`, and `.github/copilot-instructions.md`. `AGENTS.md` counts. Do not add LLM scoring.

Go, Rust, Java, Kotlin, C#, and Swift auto-pass `type-checker`. Go, Rust, and C# auto-pass `formatter`. That is a language default, not a subprocess.

`lock-file` also accepts `uv.lock`, `pdm.lock`, and `npm-shrinkwrap.json`. If none of the listed lock files exist and `detectLanguages` says Java, C, C++, or Haskell, skip the check (drop it from the L1 denominator). Otherwise fail.

`env-documentation` skips when there is no `.env.example` / `.env.template` / `.env.sample` and the tree also has no `.env`, `.env.*`, `docker-compose*.yml`, `compose*.yml`, or `.envrc` / `direnv`. Fail only when those env or compose files exist without an example.

`linter` and `type-checker` read `pyproject.toml` and `setup.cfg` (ruff, flake8, pylint, mypy, pyright). `formatter` already treats `[tool.ruff]` / `[tool.black]` in pyproject as a pass; ruff counts as both linter and formatter. Nested `tests/conftest.py` / `**/conftest.py` counts for `test-framework` (keep `[tool.pytest`). `version-pinned` also passes when `pyproject.toml` contains `requires-python`. `setup-script` also passes when a root `Makefile` exists; keep the `setup|install` target.

`license` also matches `LICENSE-*`, `LICENSE-MIT`, `COPYING`, `COPYING.md`, and `UNLICENSE`. `contributing` matches `.github/CONTRIBUTING.md` and nested `docs/**/contributing*`. `.github` is not an ignored walk directory.

## Levels

1 Foundational, 2 Guided, 3 Structured, 4 Optimized, 5 Autonomous.

L1 is 3/4 (75%). L2+ stays 80% sequential. Minimum level is 1. Non-AI counts: L1=4 need 3, L2=10 need 8, L3=12 need 10, L4=8 need 7, L5=1 need 1 (`bundle-analysis`). If the report would show Level 5, add the disclaimer. Do not celebrate Autonomous.

Optional helper: `node scripts/code-readiness.mjs <repo>` applies this same catalog with Node `fs` only. No npm install.
