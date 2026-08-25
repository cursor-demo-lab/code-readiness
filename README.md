# code-readiness

Cursor skill that scores a repository with local [`@kodus/agent-readiness@0.1.3`](https://github.com/kodustech/agent-readiness) and renders the report on a Cursor `/canvas`.

Inspired by Factory Agent Readiness. Not a Factory report. Not `/doctor`.

## How to run

From this skill repo, against a repository root:

```bash
node scripts/code-readiness.mjs /path/to/repo
```

That is the only supported engine command, wrapped so AI stays off:

```bash
npx --yes @kodus/agent-readiness@0.1.3 <repoPath> --format json --ci --no-web
```

`--no-web` is required. JSON output does not disable the Kodus web server, and without `--no-web` the process hangs. The wrapper unsets `OPENAI_API_KEY` and `KODUS_API_KEY` on the child. It never inherits them. Pin `0.1.3`. Never `@latest`.

Useful flags on the wrapper:

- `--force` skip the JSON cache
- `--json` print the mapped payload and canvas paths as JSON
- `--skip-canvas` run Kodus and map only

The script prints three chat lines and a canvas link. First canvas in a workspace also prints one sentence on what a canvas is.

JSON reports cache under `<repo>/.cursor/cache/readiness/` with a dirty-aware key: repo root, Kodus `0.1.3`, flag set, config hash, `HEAD`, and `git status --porcelain`. Optional 24h TTL. That directory is gitignored. Do not commit cache.

Agents should follow `SKILL.md`. Canvas copy and sidecar rules are in `canvas/CANVAS.md`.

## Honesty

**Kodus.** Deterministic file and config checks. Seven Kodus pillars. Five Kodus levels: Foundational, Guided, Structured, Optimized, Autonomous. 80% of this level's non-skipped checks, sequential, minimum level 1. Skipped AI checks are a third state and drop out of the denominator. v1 never runs those AI checks.

**Factory Agent Readiness.** Inspiration only. Factory uses unpublished LLM pillars. This skill does not call Factory APIs, does not reproduce Factory numerators, and must not say "Factory score" or "Factory-compatible".

**`/doctor`.** A qualitative Cursor rubric with a different canvas schema. `/code-readiness` is the Kodus file and config score. `/doctor` is the Cursor rubric. The scores are not comparable. This skill does not wrap the Doctor canvas.

Kodus `ai-context` does not look for `AGENTS.md`. It looks for `CLAUDE.md`, `.cursor/rules`, `.cursorrules`, and `.github/copilot-instructions.md`. An `AGENTS.md` overlay, if shown, stays outside the Kodus 80% denominator.

If a run would display Level 5, the canvas adds a disclaimer. That band can trip on `bundle-analysis` alone because AI checks are skipped. Do not treat it as Autonomous in the Kodus AI sense.

## Eval

`eval/` is a later Opus 5 CloudAgent harness. This repository does not run goldens or an LLM judge.
