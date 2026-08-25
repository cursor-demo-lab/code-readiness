You are scoring /code-readiness eval outputs. Return JSON only. No markdown. No preamble.

Engine: checks/catalog.json filesystem heuristics in cursor-demo-lab/code-readiness. Deterministic file and config presence. v1 never runs AI. llm_calls must be 0. This is not /doctor. Do not treat AGENTS.md as an ai-context pass. Do not expect a third-party JSON dump.

Goldens, expected ordinal bands only:
- socketio/chat-example @ frozen SHA, expected LOW
- expressjs/express @ frozen SHA, expected LOW-MID
- fastapi/fastapi @ frozen SHA, expected MID-HIGH
- nektos/act @ frozen SHA, expected HIGH among these four

Hard ranking on scorePercent then level: chat-example < express < fastapi ≈ act. ranking_ok is false if inverted. fastapi and act may tie or swap. Neither may land at or below express. express must stay above chat-example.

Inputs: for each golden, the sidecar report, the canvas TSX, and a fixture-agreement table for the 16 core FS check IDs against the catalog and the tree.

Score 1-5 integers:
- grounding: claims match the catalog results and the tree
- fixture_agreement: core FS checks match files at the frozen SHA per the catalog
- remediation_quality: top fixes are catalog remediations for real fails, not invented work
- canvas_completeness: regions repo_identity, maturity_level, pillar_scores, criterion_results, remediations, run_metadata (check_count, llm_calls=0) are present and filled with real data
- level_sanity: level matches the 80% sequential gate and the expected band, with Level 5 disclaimed when shown

hallucinated_configs is true if the report or canvas claims a file, tool, or config that is not in the golden tree and not in the catalog result.

Pass bar: ranking_ok true, every hallucinated_configs false, mean of all per-golden numeric scores >= 4.0, min of those scores >= 3.

Return exactly:

{
  "ranking_ok": true,
  "goldens": {
    "chat-example": {
      "grounding": 0,
      "fixture_agreement": 0,
      "remediation_quality": 0,
      "canvas_completeness": 0,
      "level_sanity": 0,
      "hallucinated_configs": false
    },
    "express": {
      "grounding": 0,
      "fixture_agreement": 0,
      "remediation_quality": 0,
      "canvas_completeness": 0,
      "level_sanity": 0,
      "hallucinated_configs": false
    },
    "fastapi": {
      "grounding": 0,
      "fixture_agreement": 0,
      "remediation_quality": 0,
      "canvas_completeness": 0,
      "level_sanity": 0,
      "hallucinated_configs": false
    },
    "act": {
      "grounding": 0,
      "fixture_agreement": 0,
      "remediation_quality": 0,
      "canvas_completeness": 0,
      "level_sanity": 0,
      "hallucinated_configs": false
    }
  },
  "mean": 0,
  "min": 0,
  "pass": false
}
