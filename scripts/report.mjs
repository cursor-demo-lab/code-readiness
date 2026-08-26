import path from "node:path";
import {
  ATTRIBUTION,
  ENGINE_NAME,
  LEVEL_LABELS,
  LEVEL_THRESHOLD,
  SCOPE_LABEL,
} from "./constants.mjs";
import { hashCatalog } from "./catalog.mjs";
import { readGitHead } from "./lib.mjs";
import { recommend, scoreResults } from "./evaluate.mjs";

function joinEnglish(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function thesis(repoName, level, label, scorePercent, remediations) {
  const titles = remediations.slice(0, 3).map((item) => item.title);
  const fix =
    titles.length === 0
      ? "No failing checks in this run."
      : `Fix ${joinEnglish(titles)} first.`;
  return `${repoName} is Level ${level} ${label} at ${scorePercent}% of counted checks. ${fix} Scoring is ${SCOPE_LABEL}.`;
}

function countedAtLevel(results, level) {
  const rows = results.filter((row) => row.level === level && !row.skipped);
  return {
    passed: rows.filter((row) => row.pass).length,
    total: rows.length,
  };
}

export function buildReport(evaluation, options = {}) {
  const repoRoot = options.repoRoot;
  const repoName = options.repoName ?? path.basename(repoRoot);
  const gitSha = options.gitSha ?? readGitHead(repoRoot);
  const generated_at = options.generated_at ?? new Date().toISOString();
  const scored = scoreResults(evaluation.catalog, evaluation.results);
  const remediations = recommend(evaluation.results, scored.level);
  const skippedAi = evaluation.results.filter((row) => row.skipped && row.requiresLLM);
  const label = LEVEL_LABELS[scored.level];
  const nextLevel = scored.nextLevelProgress.nextLevel;
  const l2 = countedAtLevel(evaluation.results, 2);
  const l1CapReasons = evaluation.results
    .filter((row) => row.level === 1 && !row.skipped && !row.pass)
    .map((row) => row.criterionId);
  const l1Capped =
    scored.level === 1 &&
    l2.total > 0 &&
    l2.passed / l2.total >= LEVEL_THRESHOLD &&
    l1CapReasons.length > 0;
  const level5Disclaimer =
    scored.level === 5
      ? "v1 skips L5 quality checks. Level 5 here means the one non-AI Level 5 check passed, bundle-analysis. It is not an Autonomous rating."
      : null;
  const criterion_results = evaluation.results.map((row) => ({
    pillarId: row.pillarId,
    pillarName:
      evaluation.catalog.pillars.find((pillar) => pillar.id === row.pillarId)?.name ??
      row.pillarId,
    criterionId: row.criterionId,
    name: row.name,
    level: row.level,
    requiresLLM: row.requiresLLM,
    pass: row.pass,
    skipped: row.skipped,
    message: row.message,
    details: row.details,
    fix: row.fix,
  }));
  return {
    repo_identity: {
      name: repoName,
      path: repoRoot,
      gitSha,
      scope: SCOPE_LABEL,
    },
    maturity_level: {
      level: scored.level,
      label,
      scorePercent: scored.scorePercent,
      nextLevel,
      nextLevelLabel: nextLevel ? LEVEL_LABELS[nextLevel] : null,
      nextLevelCurrent: scored.nextLevelProgress.current,
      nextLevelNeeded: scored.nextLevelProgress.needed,
      nextLevelRemaining: scored.nextLevelProgress.remaining,
      l1Passed: scored.l1Passed,
      l1Total: scored.l1Total,
      l2Passed: scored.l2Passed,
      l2Total: scored.l2Total,
      l1CapReasons,
      l1Capped,
    },
    pillar_scores: scored.pillarScores,
    criterion_results,
    remediations,
    languages: [...(evaluation.languages ?? [])],
    run_metadata: {
      engine: ENGINE_NAME,
      catalogHash: hashCatalog(),
      generated_at,
      gitSha,
      check_count: evaluation.results.length,
      llm_calls: 0,
      skipped_ai_count: skippedAi.length,
      duration_ms: options.duration_ms ?? 0,
      cacheHit: Boolean(options.cacheHit),
      scope: SCOPE_LABEL,
    },
    thesis: thesis(repoName, scored.level, label, scored.scorePercent, remediations),
    level5Disclaimer,
    agentsMdNote: null,
    attribution: ATTRIBUTION,
  };
}

export function chatLines(payload, canvasMarkdown) {
  const { maturity_level: band, remediations } = payload;
  const top = remediations[0];
  const topFix = top ? `${top.title}. ${top.description}` : "No failing checks in this run.";
  const canvas =
    canvasMarkdown == null
      ? "Canvas: paste the write-tool save-result URL. Do not invent one."
      : `Canvas: [code-readiness](${canvasMarkdown})`;
  return [
    `Level ${band.level} ${band.label} (${band.scorePercent}%).`,
    `Top fix: ${topFix}`,
    canvas,
  ];
}
