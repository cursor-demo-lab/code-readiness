# ADR: scoring contract v2

Supersedes the v1.1 identity band (L1 75% of readme / license / lock-file).

## Decision

Align **level placement of existing check ids** with Factory Agent Readiness. Unlock remains 80% of counted rows at the current level. Skipped rows leave the denominator. The walk is still sequential; minimum level is 1. No new criterion ids. No new pillars. No LLM scoring. No L4/L5 retune except ids that left those levels.

- **`thresholdForLevel` is 0.80 for every level, including L1.** The 0.75 L1 special case is gone. `catalog.level1Threshold` is 0.8.
- **Labels (engine-owned):** 1 Functional, 2 Documented, 3 Standardized, 4 Optimized, 5 Autonomous. Canvas may print these strings from report JSON; it does not recompute the gate.
- **L1 Functional:** `readme`, `linter`, `test-files-exist`, `type-checker`. 80% of 4 requires 4/4. When `type-checker` skips, 80% of 3 requires 3/3. License and lock-file are not an L1 identity band.
- **`type-checker` skip.** Keep `languagesPass` for Go / Rust / Java / Kotlin / C# / Swift. Pass on mypy / pyright files, `setup.cfg` `[mypy]`, pyproject `[tool.mypy]` / `[tool.pyright]`, or `tsconfig.json` with `strict: true`. If none of those hit and there is no `tsconfig.json`, skip (JavaScript without tsconfig, Python without mypy/pyright, and similar). A present non-strict `tsconfig.json` still fails. Skip drops from the L1 denominator.
- **L2 Documented:** `license` and `lock-file` move here (lock-file keeps the JS/TS/Python/Java/C/Haskell skip-when-absent). `ai-context` and `pre-commit-hooks` move here from L3. Also: `editorconfig`, `formatter`, `test-framework`, `test-script`, `contributing`, `env-documentation`, `setup-script`, `version-pinned`, `ci-config`.
- **L3 Standardized:** `api-docs`, `codeowners`, `containerization`, `ci-runs-tests`, `ci-runs-linters`, `build-automated`, `no-outdated-deps`, `security-policy`, `dep-update-automation`.
- **Python-native L2 detectors (unchanged from this branch).** `test-script` still accepts `scripts.test` / Makefile `test`, plus `scripts/test` / `scripts/test.sh` / `scripts/test-*`, tox/nox/pytest.ini, or pyproject `[tool.pytest` / `[tool.tox` / `[tool.hatch.envs`. `setup-script` still accepts package.json `scripts.dev|test|lint|build`, Makefile `setup|install`, a root Makefile, plus `scripts/install*`, `setup.py` / `setup.cfg`, or pyproject `[build-system]`.

## Level map (existing ids only)

| Level | Label | Counted ids |
| --- | --- | --- |
| 1 | Functional | readme, linter, test-files-exist, type-checker |
| 2 | Documented | license, lock-file, editorconfig, formatter, test-framework, test-script, contributing, env-documentation, setup-script, version-pinned, ci-config, ai-context, pre-commit-hooks |
| 3 | Standardized | api-docs, codeowners, containerization, ci-runs-tests, ci-runs-linters, build-automated, no-outdated-deps, security-policy, dep-update-automation |
| 4 | Optimized | coverage-config, e2e-tests, architecture-docs, deploy-pipeline, branch-protection, dead-code-detection, security-scanning, secrets-detection |
| 5 | Autonomous | bundle-analysis (plus skipped LLM rows) |

Non-AI counts: L1=4 need 4 (3/3 when type-checker skips), L2=13 need 11, L3=9 need 8, L4=8 need 7, L5=1 need 1.

## Why

Factory L1 Functional examples are README, linter, type checker, and unit tests. Factory L2 Documented examples include AGENTS.md and pre-commit. Our previous L1 75% identity band (readme / license / lock) was the lie: a repo could look Functional and still sit at band 1 for a missing lockfile, or look unfinished and clear L1 on license+lock alone.

Factory L3 examples include FastAPI. The earlier Python-native `test-script` / `setup-script` work stays: pytest/tox/hatch and `scripts/test*` / `[build-system]` are real signals, not JS/Makefile-only shapes.

## Explicitly refused

- New criterion ids
- New pillars (observability, task discovery, product, build-system)
- LLM checks (`v1SkipLLM`; L5 quality rows stay skipped)
- Moving `branch-protection` to L2 (detector is a weak file mention; stays L4)
- Moving `containerization` to L2 (Dockerfile false-pass; stays L3 Standardized). Factory's L2 devcontainer is a subset of this detector.
- Moving `e2e-tests` to L3 (Factory L3 integration tests). Our detector is Playwright/Cypress, not generic integration; stays L4.
- L4/L5 threshold or id retune beyond ids that moved away
- Canvas chrome / layout (level label strings only)

## Unchanged mechanics

- Sequential 80% gate, skipped rows out of the denominator
- Repository-root walk
- Seven pillars
- Python-native test-script / setup-script detectors
- `env-documentation` skip on empty trees
- `lock-file` language-aware skip-when-absent (now an L2 skip)
