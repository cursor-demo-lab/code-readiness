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

**This catalog.** Deterministic file and config presence. Seven pillars. Five levels: Foundational, Guided, Structured, Optimized, Autonomous. L1 is 75% of counted L1 rows (readme, license, lock-file). editorconfig is L2 style. L2+ stays 80% sequential, minimum level 1. Skipped L5 quality checks are a third state and drop out of the denominator. v1 never runs those quality checks.

**`/doctor`.** A qualitative Cursor rubric with a different canvas schema. The scores are not comparable.

`ai-context` looks for `AGENTS.md`, `.github/AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, `.cursorrules`, and `.github/copilot-instructions.md`. `AGENTS.md` counts. Do not add LLM scoring.

If a run would display Level 5, the canvas adds a disclaimer. That band can trip on `bundle-analysis` alone because quality checks are skipped.

## Eval

`eval/` is a later Opus 5 CloudAgent harness. Ground truth is this catalog versus the golden tree. This repository does not run goldens or an LLM judge.
