import assert from "node:assert/strict";
import { mapKodusReport } from "./map-report.mjs";

const kodusJson = {
  repoName: "sample",
  repoPath: "/tmp/sample",
  projectInfo: { detectedTypes: ["node"], isMonorepo: false, packages: [] },
  pillars: [
    {
      id: "documentation",
      name: "Documentation",
      description: "",
      icon: "",
      criteria: [
        {
          id: "readme",
          name: "README with substance",
          pillarId: "documentation",
          level: 1,
          requiresLLM: false,
        },
        {
          id: "ai-context",
          name: "AI context files",
          pillarId: "documentation",
          level: 3,
          requiresLLM: false,
        },
        {
          id: "readme-quality",
          name: "README quality (AI)",
          pillarId: "documentation",
          level: 5,
          requiresLLM: true,
        },
      ],
    },
    {
      id: "security",
      name: "Security",
      description: "",
      icon: "",
      criteria: [
        {
          id: "license",
          name: "License file present",
          pillarId: "security",
          level: 1,
          requiresLLM: false,
        },
      ],
    },
  ],
  results: {
    documentation: [
      {
        criterionId: "readme",
        pass: true,
        message: "README.md found",
      },
      {
        criterionId: "ai-context",
        pass: false,
        message: "No AI context files found.",
        details: "Add CLAUDE.md",
      },
      {
        criterionId: "readme-quality",
        pass: false,
        skipped: true,
        message: "Requires --ai flag",
      },
    ],
    security: [
      {
        criterionId: "license",
        pass: false,
        message: "No LICENSE file found.",
      },
    ],
  },
  levelResult: {
    level: 1,
    nextLevelProgress: {
      current: 0,
      needed: 8,
      remaining: 8,
      nextLevel: 2,
    },
  },
  pillarScores: [
    { pillarId: "documentation", passed: 1, total: 2, percentage: 50 },
    { pillarId: "security", passed: 0, total: 1, percentage: 0 },
  ],
  recommendations: [
    {
      title: "License file present",
      description: "Add a LICENSE file specifying the project's license",
      reason: "A clear license file helps agents understand what they can use",
      effort: "low",
      impact: "high",
      pillarId: "security",
      criterionId: "license",
    },
    {
      title: "AI context files",
      description: "Add CLAUDE.md, .cursorrules, or copilot-instructions.md",
      reason: "AI context files give agents tailored instructions",
      effort: "low",
      impact: "medium",
      pillarId: "documentation",
      criterionId: "ai-context",
    },
  ],
};

const payload = mapKodusReport(kodusJson, {
  repoRoot: "/tmp/sample",
  gitSha: "abc123",
  generated_at: "2026-08-25T00:00:00.000Z",
  duration_ms: 12,
  cacheHit: false,
});

assert.equal(payload.maturity_level.level, 1);
assert.equal(payload.maturity_level.label, "Foundational");
assert.equal(payload.maturity_level.scorePercent, 33);
assert.equal(payload.run_metadata.llm_calls, 0);
assert.equal(payload.run_metadata.check_count, 4);
assert.equal(payload.run_metadata.skipped_ai_count, 1);
assert.equal(payload.remediations[0].criterionId, "license");
assert.equal(payload.criterion_results.filter((row) => row.skipped).length, 1);
assert.match(payload.attribution, /Kodus Agent Readiness @0\.1\.3/);
assert.match(payload.attribution, /not a Factory report/);
assert.equal(payload.repo_identity.scope, "repository root only");
assert.doesNotMatch(JSON.stringify(payload), /Factory score|Factory-compatible|Standardized|9 pillars/);

const level5 = mapKodusReport(
  {
    ...kodusJson,
    levelResult: {
      level: 5,
      nextLevelProgress: { current: 0, needed: 0, remaining: 0, nextLevel: null },
    },
  },
  { repoRoot: "/tmp/sample", gitSha: "abc123", duration_ms: 1, cacheHit: true },
);
assert.ok(level5.level5Disclaimer);
assert.match(level5.level5Disclaimer, /bundle-analysis/);
assert.doesNotMatch(level5.level5Disclaimer, /celebrate|Autonomous rating in the marketing/);

process.stdout.write("map-report.test.mjs ok\n");
