# code-readiness

Cursor skill that scores a repository with **local filesystem heuristics** from `checks/catalog.json` and renders the report on a Cursor `/canvas`.

Inspired by Kodus and Factory Agent Readiness. Not a Factory report. Not `/doctor`. Not running `@kodus/agent-readiness`.

## How to run

Agents follow `SKILL.md`: resolve the repo root, walk the catalog with Read / glob / grep, fill report JSON, copy the canvas template and sidecar.

Optional helper, Node `fs` only, no package install:

```bash
node scripts/code-readiness.mjs /path/to/repo
```

Do not `npx @kodus/agent-readiness`. Do not npm or bun install anything for scoring. Do not call Factory. Do not run tests, linters, or scanners. Reading config files is the whole check.

Useful flags:

- `--force` skip the JSON cache
- `--json` print the mapped payload and canvas paths
- `--skip-canvas` score only

The helper prints three chat lines. On desktop the canvas link is the managed `.canvas.tsx` path. On a cloud agent, paste the write-tool save-result URL. Do not invent a URL.

JSON reports cache under `<repo>/.cursor/cache/readiness/` keyed by repo root, catalog hash, and `.git/HEAD`. Optional 24h TTL. Gitignored. Do not commit cache.

Canvas copy rules are in `canvas/CANVAS.md`.

## Honesty

**This catalog.** Deterministic file and config presence. Seven pillars shaped like Kodus. Five levels: Foundational, Guided, Structured, Optimized, Autonomous. 80% of this level's non-skipped checks, sequential, minimum level 1. Skipped L5 quality checks are a third state and drop out of the denominator. v1 never runs those quality checks.

**Kodus CLI.** Inspiration for pillar names, check ids, and the 80% gate. This skill does not vendor or invoke `@kodus/agent-readiness`.

**Factory Agent Readiness.** Inspiration only. Factory uses unpublished LLM pillars. This skill does not call Factory APIs and must not say "Factory score" or "Factory-compatible".

**`/doctor`.** A qualitative Cursor rubric with a different canvas schema. The scores are not comparable.

`ai-context` does not look for `AGENTS.md`. It looks for `CLAUDE.md`, `.cursor/rules`, `.cursorrules`, and `.github/copilot-instructions.md`. An `AGENTS.md` note, if shown, stays outside the 80% denominator.

If a run would display Level 5, the canvas adds a disclaimer. That band can trip on `bundle-analysis` alone because quality checks are skipped.

## Eval

`eval/` is a later Opus 5 CloudAgent harness. Ground truth is this catalog versus the golden tree. This repository does not run goldens or an LLM judge.
