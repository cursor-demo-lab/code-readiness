import {
  AI_CRITERION_IDS,
  ATTRIBUTION,
  ENGINE_NAME,
  FLAG_SET,
  KODUS_VERSION,
  LEVEL_LABELS,
  SCOPE_LABEL,
} from "./constants.mjs";
import { fileExists, gitHead } from "./lib.mjs";

function overallPercentage(pillarScores) {
  if (!Array.isArray(pillarScores) || pillarScores.length === 0) return 0;
  const totalPassed = pillarScores.reduce((sum, score) => sum + score.passed, 0);
  const totalCriteria = pillarScores.reduce((sum, score) => sum + score.total, 0);
  if (totalCriteria === 0) return 0;
  return Math.round((totalPassed / totalCriteria) * 100);
}

function joinEnglish(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function flattenResults(kodusJson) {
  const criterionById = new Map();
  for (const pillar of kodusJson.pillars ?? []) {
    for (const criterion of pillar.criteria ?? []) {
      criterionById.set(criterion.id, { ...criterion, pillarName: pillar.name });
    }
  }
  const recByCriterion = new Map();
  for (const rec of kodusJson.recommendations ?? []) {
    recByCriterion.set(rec.criterionId, rec);
  }
  const rows = [];
  const results = kodusJson.results ?? {};
  for (const [pillarId, pillarResults] of Object.entries(results)) {
    for (const result of pillarResults ?? []) {
      const meta = criterionById.get(result.criterionId);
      const rec = recByCriterion.get(result.criterionId);
      rows.push({
        pillarId,
        pillarName: meta?.pillarName ?? pillarId,
        criterionId: result.criterionId,
        name: meta?.name ?? result.criterionId,
        level: meta?.level ?? null,
        requiresLLM: Boolean(meta?.requiresLLM),
        pass: Boolean(result.pass),
        skipped: Boolean(result.skipped),
        message: result.message ?? "",
        details: result.details,
        fix: rec?.description ?? result.details ?? "",
      });
    }
  }
  return rows;
}

function thesis(repoName, level, label, scorePercent, remediations) {
  const titles = remediations.slice(0, 3).map((item) => item.title);
  const fix =
    titles.length === 0
      ? "No failing Kodus checks in this run."
      : `Fix ${joinEnglish(titles)} first.`;
  return `${repoName} is Kodus Level ${level} ${label} at ${scorePercent}% of counted checks. ${fix} Scoring is ${SCOPE_LABEL}.`;
}

function agentsMdNote(repoRoot, rows) {
  if (!fileExists(repoRoot, "AGENTS.md")) return null;
  const aiContext = rows.find((row) => row.criterionId === "ai-context");
  if (!aiContext || aiContext.pass || aiContext.skipped) return null;
  return "Kodus ai-context does not check AGENTS.md. AGENTS.md is present at the repository root and is not part of the Kodus 80% denominator.";
}

export function mapKodusReport(kodusJson, options = {}) {
  const repoRoot = options.repoRoot ?? kodusJson.repoPath;
  const gitSha = options.gitSha ?? gitHead(repoRoot);
  const generated_at = options.generated_at ?? new Date().toISOString();
  const duration_ms = options.duration_ms ?? 0;
  const cacheHit = Boolean(options.cacheHit);
  const level = kodusJson.levelResult?.level ?? 1;
  const label = LEVEL_LABELS[level] ?? `Level ${level}`;
  const scorePercent = overallPercentage(kodusJson.pillarScores ?? []);
  const next = kodusJson.levelResult?.nextLevelProgress ?? {};
  const nextLevel = next.nextLevel ?? null;
  const rows = flattenResults(kodusJson);
  const skippedAi = rows.filter(
    (row) => row.skipped && (row.requiresLLM || AI_CRITERION_IDS.includes(row.criterionId)),
  );
  const remediations = (kodusJson.recommendations ?? []).slice(0, 5).map((rec) => ({
    id: rec.criterionId,
    title: rec.title,
    description: rec.description,
    reason: rec.reason,
    effort: rec.effort,
    impact: rec.impact,
    pillarId: rec.pillarId,
    criterionId: rec.criterionId,
  }));
  const pillarNameById = new Map(
    (kodusJson.pillars ?? []).map((pillar) => [pillar.id, pillar.name]),
  );
  const level5Disclaimer =
    level === 5
      ? "This run skipped AI checks. Level 5 here means the one non-AI Level 5 check passed, bundle-analysis. It is not an Autonomous rating in the Kodus AI sense. v1 never runs AI."
      : null;
  const payload = {
    repo_identity: {
      name: kodusJson.repoName,
      path: kodusJson.repoPath,
      gitSha,
      scope: SCOPE_LABEL,
    },
    maturity_level: {
      level,
      label,
      scorePercent,
      nextLevel,
      nextLevelLabel: nextLevel ? LEVEL_LABELS[nextLevel] : null,
      nextLevelCurrent: next.current ?? 0,
      nextLevelNeeded: next.needed ?? 0,
      nextLevelRemaining: next.remaining ?? 0,
    },
    pillar_scores: (kodusJson.pillarScores ?? []).map((score) => ({
      pillarId: score.pillarId,
      name: pillarNameById.get(score.pillarId) ?? score.pillarId,
      passed: score.passed,
      total: score.total,
      percentage: score.percentage,
    })),
    criterion_results: rows,
    remediations,
    run_metadata: {
      engine: ENGINE_NAME,
      kodusVersion: KODUS_VERSION,
      generated_at,
      gitSha,
      check_count: rows.length,
      llm_calls: 0,
      skipped_ai_count: skippedAi.length,
      duration_ms,
      flags: FLAG_SET,
      cacheHit,
      scope: SCOPE_LABEL,
    },
    thesis: thesis(kodusJson.repoName, level, label, scorePercent, remediations),
    level5Disclaimer,
    agentsMdNote: agentsMdNote(repoRoot, rows),
    attribution: `${ENGINE_NAME} @${KODUS_VERSION}, ${ATTRIBUTION}`,
  };
  return payload;
}

export function chatLines(payload, canvasMarkdown) {
  const { maturity_level: band, remediations } = payload;
  const top = remediations[0];
  const topFix = top
    ? `${top.title}. ${top.description}`
    : "No failing Kodus checks in this run.";
  return [
    `Kodus Level ${band.level} ${band.label} (${band.scorePercent}%).`,
    `Top fix: ${topFix}`,
    `Canvas: [code-readiness](${canvasMarkdown})`,
  ];
}
