# Remediations

Per catalog id. Install → wire → run → re-score. Config-only is never done.

## Dummy-prone (tool must run)

### `dead-code-detection`

JS/TS: `npm install -D knip`, `scripts.knip`, `knip.json` entries for the real app, CI step `npm run knip`. Run `npm run knip` and fix unused exports. `knip.json` without the package, script, and a green run is not remediating.

Python: `vulture` in `pyproject.toml` / extras, CI `vulture`. Run it. A `.vulture` whitelist alone is not remediating.

Rust: `cargo-machete` in CI or a Makefile target. Run it.

Go: CI `deadcode ./...` or equivalent. Run it.

### `e2e-tests`

Install Playwright (or Cypress if that is already the repo). `testDir` must point at product specs. Add a non-empty spec that hits a real product path (`e2e/login.spec.ts`). `scripts.test:e2e`. App-owned CI job that installs the browser and runs `npm run test:e2e`. Run that command. `playwright.config.ts`, `cypress.config.ts`, or an empty `e2e/` is not remediating.

### `secrets-detection`

Install gitleaks (script into `$HOME/.local/bin` or CI action). Config may exist. Wire a `beforeShellExecution` hook (or CI) that scans **staged** files on `git commit`. Cloud Agent `install` must fetch the same binary. Run `gitleaks git --pre-commit --staged` (or `gitleaks protect --staged`) against a clean staged set. `.gitleaks.toml` without a runner is not remediating. Do not edit managed `.githooks/pre-commit`.

### `linter`

Install the language-native linter (ESLint, Biome, golangci-lint, ruff). `scripts.lint`. CI `npm run lint` / equivalent. Run it. An empty `eslint.config.js` is not remediating. Formatter-only hooks do not count.

### `ci-runs-tests` / `ci-runs-linters` / `security-scanning`

Add the step to **app-owned** CI. The step must be the same command you can run locally (`npm test`, `npm run lint`, CodeQL/Semgrep action). Run the local command. Do not add a comment that mentions `vitest` without invoking it.

### `bundle-analysis`

Install `size-limit` or `@next/bundle-analyzer`. Script + config that measures real client chunks. Run the script. `.size-limit.json` without the package and a green run is not remediating.

### `coverage-config`

Turn coverage on in the existing runner (`vitest --coverage`, pytest-cov). Include the product tree. Script + CI optional. Run the coverage command. `.coveragerc` / `"coverage"` in package.json with no runner flag is not remediating.

### `pre-commit-hooks`

A Cursor hook (`.cursor/hook.json`) or Husky/Lefthook that runs a real linter/scanner command. Existence of `hooks.json` is not enough. Prove the command the hook calls.

### `containerization`

`.cursor/environment.json` (or `.devcontainer`) with `install` / `start` that actually boots this app. If remediations added binaries (gitleaks), `install` must install them. An empty `environment.json` is not remediating.

## Docs and contracts (substance, then read back)

### `readme` / `contributing` / `ai-context` / `architecture-docs` / `security-policy` / `issue-templates` / `license`

Write the real file the catalog names (`AGENTS.md` for `ai-context`, `SECURITY.md` for disclosure, `LICENSE` at root). Repo-specific. Over `minBytes` when set. Read the file back; a title-only stub is not remediating. Do not dummy `CONTRIBUTING.md` only to mention branch protection.

### `branch-protection`

Document the real org/repo rule in `CONTRIBUTING.md` or commit `.github/settings.yml`. Missing local files skip; do not invent a policy.

### `api-docs`

OpenAPI/TypeDoc that matches `app/api/*` (or the public surface). Empty `openapi.yaml` is not remediating.

### `codeowners`

A `CODEOWNERS` the repo already uses. Do not overwrite ranger-owned CODEOWNERS on internalsphere apps.

## Environment

### `version-pinned`

Language-honest pin (`.nvmrc`, `rust-toolchain.toml`, `python_requires`). Not an empty asdf file.

### `lock-file` / `no-outdated-deps`

Commit the lockfile after the install you just ran.

### `setup-script` / `test-script` / `test-framework` / `test-files-exist`

Named commands that exist and run. Add a real product test, not `test/placeholder.test.ts` that asserts `true`.

### `env-documentation`

`.env.example` with the keys the app reads. No secret values.

### `dep-update-automation`

Real Dependabot/Renovate config for this package ecosystem.

### `deploy-pipeline`

Platform config the repo actually ships with (`vercel.json` if Vercel). Do not add Terraform for a Vercel app.

### `use-effect`

Remove the product-tree `useEffect`. Do not add one.

### `naming-conventions` / `test-quality` / `readme-quality` / `docs-agent-friendliness`

v1 skips `requiresLLM`. Leave them skipped.

## After each id

```bash
# the wired command from this id, then:
node <code-readiness>/scripts/code-readiness.mjs <repoPath> --skip-canvas --force
```

If the command was not run, the id is still open.
