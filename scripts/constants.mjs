export const ENGINE_NAME = "code-readiness filesystem heuristics";
export const ATTRIBUTION =
  "local filesystem heuristics from checks/catalog.json; not /doctor.";
export const SCOPE_LABEL = "repository root only";
export const CANVAS_FILENAME = "code-readiness.canvas.tsx";
export const CANVAS_TITLE = "Code Readiness";
export const SIDECAR_FILENAME = "code-readiness.canvas.data.json";
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const LEVEL_THRESHOLD = 0.8;
export const LEVEL_1_THRESHOLD = 0.8;

export function thresholdForLevel(_level) {
  return LEVEL_THRESHOLD;
}

export const LEVEL_LABELS = {
  1: "Functional",
  2: "Documented",
  3: "Standardized",
  4: "Optimized",
  5: "Autonomous",
};
export const AI_CRITERION_IDS = [
  "naming-conventions",
  "test-quality",
  "readme-quality",
  "docs-agent-friendliness",
];
export const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  "coverage",
  ".next",
  "__pycache__",
  ".cursor",
]);
export const CI_GLOBS = [
  ".github/workflows/*.yml",
  ".github/workflows/*.yaml",
  ".gitlab-ci.yml",
  ".circleci/config.yml",
  "Jenkinsfile",
  ".travis.yml",
];
export const TEST_FILE_GLOBS = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/test_*.py",
  "**/*_test.go",
  "**/*Test.kt",
  "**/*Tests.kt",
  "**/*Spec.kt",
  "src/test/**/*.kt",
  "**/*Test.java",
  "**/*Tests.java",
  "src/test/**/*.java",
  "tests/**/*.rs",
  "**/*Test.cs",
  "**/*Tests.cs",
  "spec/**/*_spec.rb",
  "tests/**/*Test.php",
  "Tests/**/*Tests.swift",
];
