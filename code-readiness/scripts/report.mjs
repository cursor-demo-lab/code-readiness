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

const LANG_ORDER = [
  "go",
  "rust",
  "elixir",
  "ruby",
  "python",
  "c",
  "cpp",
  "haskell",
  "java",
  "kotlin",
  "csharp",
  "swift",
  "typescript",
  "javascript",
  "node",
];

const VERSION_PIN_ORDER = [
  "go",
  "rust",
  "elixir",
  "ruby",
  "java",
  "kotlin",
  "csharp",
  "swift",
  "typescript",
  "javascript",
  "node",
  "python",
  "c",
  "cpp",
  "haskell",
];

const VERSION_PIN_BY_LANG = {
  typescript: ".nvmrc",
  javascript: ".nvmrc",
  node: ".nvmrc",
  python: ".python-version",
  go: "go.mod",
  rust: "rust-toolchain.toml",
  ruby: ".ruby-version",
};

const LINTER_BY_LANG = {
  go: ".golangci.yml",
  rust: "clippy.toml",
  elixir: ".credo.exs",
  ruby: ".rubocop.yml",
  python: "ruff.toml",
  c: ".clang-tidy",
  cpp: ".clang-tidy",
  haskell: ".hlint.yaml",
  java: "checkstyle.xml",
  kotlin: "detekt.yml",
  csharp: "stylecop.json",
  swift: ".swiftlint.yml",
  typescript: "eslint.config.js",
  javascript: "eslint.config.js",
  node: "eslint.config.js",
};

const LABEL_BY_ID = {
  "pre-commit-hooks": "hooks",
};

const OPEN_BY_ID = {
  linter: "eslint.config.js",
  "ai-context": "AGENTS.md",
  readme: "README.md",
  "type-checker": "tsconfig.json",
  editorconfig: ".editorconfig",
  license: "LICENSE",
  contributing: "CONTRIBUTING.md",
  "pre-commit-hooks": ".cursor/hooks.json",
  "ci-config": ".github/workflows/ci.yml",
};

const CONCRETE_PATHS = [
  "eslint.config.js",
  ".golangci.yml",
  "clippy.toml",
  "ruff.toml",
  ".credo.exs",
  ".clang-tidy",
  ".rubocop.yml",
  ".hlint.yaml",
  "checkstyle.xml",
  "detekt.yml",
  "stylecop.json",
  ".swiftlint.yml",
  "AGENTS.md",
  "README.md",
  "LICENSE",
  ".pre-commit-config.yaml",
  ".github/workflows/ci.yml",
  "tsconfig.json",
];

function pickLangFile(byLang, languages, order = LANG_ORDER) {
  if (!languages?.length) return null;
  const known = new Set(languages);
  for (const lang of order) {
    if (known.has(lang) && byLang[lang]) return byLang[lang];
  }
  return null;
}

function pathFromHit(row) {
  const blob = `${row?.message ?? ""} ${row?.details ?? ""}`;
  return CONCRETE_PATHS.find((file) => blob.includes(file)) ?? null;
}

export function chatFixFile(payload, remediation) {
  if (!remediation) return null;
  const id = remediation.criterionId;
  const row =
    payload.criterion_results?.find((item) => item.criterionId === id) ?? remediation;
  const languages = payload.languages ?? [];
  if (id === "linter") {
    const honest = pickLangFile(LINTER_BY_LANG, languages);
    if (honest) return honest;
    const hit = pathFromHit(row);
    if (hit && hit !== ".editorconfig") return hit;
    return OPEN_BY_ID.linter;
  }
  if (id === "version-pinned") {
    const honest = pickLangFile(VERSION_PIN_BY_LANG, languages, VERSION_PIN_ORDER);
    if (honest) return honest;
  }
  const hit = pathFromHit(row);
  if (hit) return hit;
  return OPEN_BY_ID[id] ?? null;
}

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
  return `${repoName} is Level ${level} ${label} at ${scorePercent}% of counted checks. ${fix}`;
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
  const file = chatFixFile(payload, top);
  const topId = top ? (LABEL_BY_ID[top.criterionId] ?? top.criterionId) : null;
  const topFix = top
    ? file
      ? `${topId} — ${file}`
      : topId
    : "No failing checks in this run.";
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
