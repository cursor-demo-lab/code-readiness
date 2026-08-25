# ADR: scoring contract v1.1

## Decision

Keep the sequential gate for levels 2–5 at `LEVEL_THRESHOLD` (0.8). Change only what made L1/L2 untruthful on the 18-repo eval.

- **L1 is 75% of counted L1 rows.** `thresholdForLevel(1)` is 0.75. L1 is readme, license, and lock-file (language-aware skip). 75% of 3 requires 3/3; when lock-file skips, 75% of 2 requires 2/2. Do not special-case individual L1 ids.
- **`editorconfig` is L2 style.** Same check id, still `style-linting`. A missing `.editorconfig` no longer caps L1. 8/9 L2 plus an editorconfig fail is 8/10 = 80% and can reach Guided.
- **L2+ stays 80% sequential.** `needed` for the next-level remainder uses the same per-level threshold (`Math.ceil(n * threshold)`).
- **`lock-file` is language-aware.** Catalog `anyFiles` and `LOCK_FILES` stay identical and include `uv.lock`, `pdm.lock`, and `npm-shrinkwrap.json`. Missing lock files skip (drop from the L1 denominator) when `detectLanguages` says Java, C, C++, Haskell, Python, JavaScript, or TypeScript. `pyproject.toml` is not a lockfile. Committed `uv.lock` / `poetry.lock` / `Pipfile.lock` / `package-lock.json` still pass. JS libraries often omit a lockfile; skip rather than fail. `setup-script` also passes on package.json `scripts.test` / `scripts.lint` / `scripts.build`, not only `scripts.dev`.
- **`env-documentation` skips empty trees.** Skip when there is no `.env.example` / `.env.template` / `.env.sample` and also no `.env`, `.env.*`, `docker-compose*.yml`, `compose*.yml`, or `.envrc` / `direnv`. Fail only when those env/compose files exist without an example.
- **Path truth.** `contributing` also matches `**/CONTRIBUTING.md` and `docs/**/contributing*` (nested FastAPI-style guides). `ai-context` accepts `AGENTS.md` and `.github/AGENTS.md`. Keep `v1SkipLLM`.

## 18-repo evidence

The band was a lie: 16/18 repos stuck at L1.

- `cli/cli` was 8/10 L2 and still Foundational because of `.editorconfig`.
- `env-documentation` failed 18/18, including libraries with nothing to document.
- Flask, FastAPI, and httpx failed L1 `lock-file` despite `uv.lock`.
- Gson, JUnit, jq, and shellcheck failed `lock-file` in languages with no conventional committed lockfile.
- huggingface/diffusers is L2 8/9 at 56% but stays Foundational because L1 is 2/4 (no `.editorconfig` and no lockfile). encode/httpx is the same shape. Python libraries often ship `pyproject.toml` / `setup.py` without committing `uv.lock` / `poetry.lock` / `Pipfile.lock`; skip lock-file in that case rather than fail.
- After PR #7, huggingface/diffusers skips lock-file and L1 is 2/3 (readme+license pass, editorconfig fail). 2/3 = 0.667 < 0.75, so it stays Foundational even though L2 is 8/9. psf/requests is the same shape (L2 9/9). encode/httpx still fails L1 on editorconfig with L2 7/9. Demoting editorconfig to L2 makes that 8/9 plus an editorconfig fail into 8/10 = 80% Guided.
- After editorconfig→L2, eslint/eslint is L1 at 62% with L1 2/3 (lock-file fail) and L2 9/10; JS libraries often omit package-lock. nestjs/nest is L1 3/3 and L2 8/11 (editorconfig, env-documentation, setup-script); `scripts.test` without `scripts.dev` should pass setup-script so 9/11 is Guided. Do not auto-pass env-documentation.

## Explicitly unchanged

- L2+ 80% sequential gate
- No LLM scoring (`v1SkipLLM`, skipped L5 quality rows stay out of the denominator)
- Repository-root walk (ignored dirs still skipped; no repo-wide search of ignored trees)
- L4/L5 check ids and thresholds
- Canvas chrome / layout (report may expose `l1Passed`, `l1Total`, `l2Passed`, `l2Total`, `l1Capped`, `l1CapReasons` for the canvas)
