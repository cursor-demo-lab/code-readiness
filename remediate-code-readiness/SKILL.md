---
name: remediate-code-readiness
description: Close failing /code-readiness checks by installing and wiring real tools, then validating them by running the command. Use when the user types /remediate-code-readiness, asks to fix readiness fails, raise the score, or remediate knip, e2e, gitleaks, or CI. This is not /code-readiness (score only) and not /doctor.
---

# /remediate-code-readiness

Close **counted catalog fails** in one repository. A check is remediating only after the tool is installed, a script/hook/CI step invokes it, and that command has been run in this session. Creating a config file is not remediating.

`/code-readiness` scores with Read / glob / grep and must not install or run tools. This skill does the opposite. Do not wrap a Doctor canvas. Do not celebrate Autonomous.

## When to use

- `/remediate-code-readiness`
- fix readiness fails / raise the score
- remediate knip, e2e, gitleaks, CI, dead-code, secrets-detection

Do not use this skill to score. Score first, then remediate.

## Done means validated

A criterion is **done** only when every box holds:

1. **Installed** — the package or binary is in the lockfile / toolchain, not hoped for on PATH.
2. **Wired** — `package.json` scripts, app-owned CI, or a Cursor hook actually invokes it.
3. **Ran** — you executed that same command in this session and it exited 0 (or you fixed the findings, then re-ran to 0).
4. **Re-scored** — `node scripts/code-readiness.mjs <repo> --skip-canvas --force` now passes the id.

If you only added `knip.json`, `playwright.config.ts`, `.gitleaks.toml`, `.size-limit.json`, or an empty `e2e/`, stop. That is file creation. It is not remediating.

Docs-only ids (`readme`, `contributing`, `ai-context`, `architecture-docs`, `license`, `security-policy`, `issue-templates`) still need substance: non-empty, repo-specific, over any `minBytes`. An empty stub is the same failure mode.

## Recipe

### 1. Score first

Resolve the git root. Find the catalog next to this skill (`../checks/catalog.json` in the skill repo, or `.cursor/skills/code-readiness/checks/catalog.json` in an app).

Reuse a fresh `.cursor/cache/readiness/` report if the catalog hash and `HEAD` match. Otherwise:

```bash
node <code-readiness>/scripts/code-readiness.mjs <repoPath> --skip-canvas --force
```

Do not emit a canvas from this skill. If the user wants an updated board, hand off to `/code-readiness` after validation.

### 2. Gate-first queue

Remediate remaining counted fails at `maturity_level.nextLevel` first, then other fails. Skip `requiresLLM` rows. Skip `editorconfig` when a linter already passes. Do not dummy `.editorconfig`.

One id at a time. Read [remediations.md](remediations.md) for that id before touching files.

### 3. Implement the runner, then the file

Language-honest: JS/TS uses knip / Playwright / ESLint / vitest; Python uses vulture / pytest; Go uses `go test` / deadcode; Rust uses cargo-machete. Do not add knip to a Go repo.

Prefer the repo's existing runner and app-owned CI (`.github/workflows/ci.yml`). Do not edit ranger/orchestrator files (`.github/workflows/managed-app.yml`, managed `CODEOWNERS`, `.githooks/pre-commit`, `scripts/setup-repo.sh`, `scripts/secrets*.py`).

If a hook needs a binary on Cloud Agents, add the install to `.cursor/environment.json` `install`. Desktop `environment.json` is unused; still keep the install script idempotent so both can run it.

### 4. Validate immediately

Run the wired command. If it fails, fix product code or the config, then re-run. Do not mark the id done on a red command. Do not skip the run because "CI will catch it".

Then re-score with `--force`. If the catalog passes but you never ran the tool, the id is still open.

### 5. Chat

For each id you closed:

- criterion id
- what was wired (script / hook / CI step)
- the exact command you ran and that it exited 0

Then list remaining counted fails, gate-first. Do not invent a new score band.

## Forbidden

- Config-only drops: `knip.json`, `playwright.config.ts`, `cypress.config.ts`, `.gitleaks.toml`, `.size-limit.json`, `.coveragerc`, empty `e2e/`, empty `SECURITY.md`
- `npx` one-shots that never land in `package.json` / lockfile
- Folding app quality steps into `managed-app.yml`
- Dummy `.husky` / `.pre-commit-config.yaml` when `.cursor/hook.json` is the repo convention
- Dummy `useEffect` to pass `use-effect` (remove the call instead)
- Committing unless the user asked
