# Eval harness

Files only. Do not run goldens or Opus in the `/code-readiness` skill PR.

A later Claude Opus 5 CloudAgent judge (`claude-opus-5`) runs this harness. The skill path never calls that model. The judge is **one batched call**, eval-only.

## What is automated

| Check | Pass rule |
| --- | --- |
| Latency | Record wall-clock of `scripts/code-readiness.mjs --skip-canvas` per golden |
| `#LLM` | `run_metadata.llm_calls` must be `0`. Fail the run if not |
| Fixture agreement | For the 16 core FS check IDs in `core-checks.json`, the Kodus result must match file presence at the frozen SHA. Do not assert Factory numerators |
| Ranking | `chat-example < express < fastapi ≈ act` on Kodus `scorePercent`, then Kodus level. Fail if inverted |
| Canvas regions | Emitted sidecar `report` must include `repo_identity`, `maturity_level`, `pillar_scores`, `criterion_results`, `remediations`, `run_metadata` with `check_count` and `llm_calls=0` |

Do not clone goldens into this repository. At eval time, clone each repo at the SHA in `sha-freeze.json`.

## Goldens

Cheap public roots. Expected bands are ordinal hints for `level_sanity`, not Factory scores.

1. `socketio/chat-example`, expected LOW
2. `expressjs/express`, expected LOW-MID. Factory L2 is an ordinal hint only
3. `fastapi/fastapi`, expected MID-HIGH
4. `nektos/act`, expected HIGH among these cheap goldens. Go auto-passes formatter and type-checker

Hard ranking: `chat-example < express < fastapi ≈ act`. Fail if inverted. `fastapi ≈ act` means those two may swap or tie. Neither may fall to or below `express`. `express` must stay above `chat-example`.

Excluded on purpose: CockroachDB. `kodustech/agent-readiness`.

## Skill command under eval

Same as production. Pin `0.1.3`. AI off. No Factory APIs.

```bash
node scripts/code-readiness.mjs <goldenRoot> --force --json
```

## Judge

Copy `judge-prompt.md` into **one** `claude-opus-5` call with all four reports and canvases. The model must return JSON only.

Pass bar: `ranking_ok` is true, no `hallucinated_configs`, mean of per-golden numeric scores `>= 4.0`, and min `>= 3`.
