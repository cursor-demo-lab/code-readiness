# code-readiness

Two Cursor skills, siblings:

- [`code-readiness/`](code-readiness/SKILL.md) — score a repo with local filesystem heuristics from `checks/catalog.json`. Never remediates.
- [`remediate-code-readiness/`](remediate-code-readiness/SKILL.md) — close catalog fails by install → wire → run → re-score. A config file alone is not done.

Not `/doctor`.

## How to run

```bash
node code-readiness/scripts/code-readiness.mjs /path/to/repo
npm test
```

Scoring docs, catalog, canvas, and eval live under `code-readiness/`.
