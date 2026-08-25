# ADR: scoring contract v1.1

## Decision

Keep the sequential gate for levels 2–5 at `LEVEL_THRESHOLD` (0.8). Change only what made L1/L2 untruthful on the 18-repo eval.

- **L1 is 3/4 (75%).** `thresholdForLevel(1)` is 0.75. One L1 miss, including a missing `.editorconfig`, can still open Guided. Two misses still cap at Foundational. Do not special-case individual L1 ids.
- **L2+ stays 80% sequential.** `needed` for the next-level remainder uses the same per-level threshold (`Math.ceil(n * threshold)`).
- **`lock-file` is language-aware.** Catalog `anyFiles` and `LOCK_FILES` stay identical and include `uv.lock`, `pdm.lock`, and `npm-shrinkwrap.json`. Missing lock files skip (drop from the L1 denominator) when `detectLanguages` says Java, C, C++, or Haskell. Otherwise fail as before.
- **`env-documentation` skips empty trees.** Skip when there is no `.env.example` / `.env.template` / `.env.sample` and also no `.env`, `.env.*`, `docker-compose*.yml`, `compose*.yml`, or `.envrc` / `direnv`. Fail only when those env/compose files exist without an example.
- **Path truth.** `contributing` matches `**/CONTRIBUTING.md`, `.github/CONTRIBUTING.md`, and `docs/**/contributing*` (cli/cli and FastAPI-style guides). `ai-context` accepts `AGENTS.md` and `.github/AGENTS.md`. `license` also matches `LICENSE-*`, `LICENSE-MIT`, `COPYING`, `COPYING.md`, and `UNLICENSE`. Keep `v1SkipLLM`.
- **Python config in pyproject/setup.cfg.** `linter` and `type-checker` read `pyproject.toml` and `setup.cfg` (`[tool.ruff]`, `[tool.mypy]`, `[tool.pyright]`, `[flake8]`). `formatter` already read `[tool.ruff]` / `[tool.black]` in pyproject; it now reads `setup.cfg` too. Ruff counts as both linter and formatter.

## 18-repo evidence

The band was a lie: 16/18 repos stuck at L1.

- `cli/cli` was 8/10 L2 and still Foundational because of `.editorconfig`.
- `env-documentation` failed 18/18, including libraries with nothing to document.
- Flask, FastAPI, and httpx failed L1 `lock-file` despite `uv.lock`.
- FastAPI configures ruff and mypy in `pyproject.toml` but failed `linter` and `type-checker` (formatter already passed on `[tool.ruff]`).
- ripgrep has `LICENSE-MIT` / `COPYING` / `UNLICENSE` and still failed `license`; jq has `COPYING`.
- `cli/cli` has `.github/CONTRIBUTING.md` and still failed `contributing`.
- Gson, JUnit, jq, and shellcheck failed `lock-file` in languages with no conventional committed lockfile.

## Explicitly unchanged

- L2+ 80% sequential gate
- No LLM scoring (`v1SkipLLM`, skipped L5 quality rows stay out of the denominator)
- Repository-root walk (ignored dirs still skipped; no repo-wide search of ignored trees)
- L4/L5 check ids and thresholds
- Canvas chrome / layout (report may expose `l1Passed`, `l1Total`, `l2Passed`, `l2Total`, `l1Capped`, `l1CapReasons` for the canvas)
