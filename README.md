# code-readiness

Two Cursor skills, siblings:

- [`code-readiness/`](code-readiness/SKILL.md) — score a repo with local filesystem heuristics from `checks/catalog.json`. Never remediates.
- [`remediate-code-readiness/`](remediate-code-readiness/SKILL.md) — close catalog fails by install → wire → run → re-score. A config file alone is not done.

Not `/doctor`. This repo is a two-skill pack. There is no `SKILL.md` at the clone root.

## Install

Copy or symlink each folder into Cursor skills. Do not clone this repo as a single skill directory.

```bash
ln -s /path/to/code-readiness/code-readiness ~/.cursor/skills/code-readiness
ln -s /path/to/code-readiness/remediate-code-readiness ~/.cursor/skills/remediate-code-readiness
```

Project install is the same pair under `.cursor/skills/`. The remediator finds the catalog at `../code-readiness/checks/catalog.json`.

## How to run

```bash
node code-readiness/scripts/code-readiness.mjs /path/to/repo
npm test
```

Scoring docs, catalog, canvas, and eval live under `code-readiness/`.
