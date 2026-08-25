export const KODUS_VERSION = "0.1.3";
export const KODUS_PACKAGE = `@kodus/agent-readiness@${KODUS_VERSION}`;
export const KODUS_FLAGS = ["--format", "json", "--ci", "--no-web"];
export const FLAG_SET = KODUS_FLAGS.join(" ");
export const ENGINE_NAME = "Kodus Agent Readiness";
export const ATTRIBUTION =
  "inspired by Factory Agent Readiness; not a Factory report.";
export const SCOPE_LABEL = "repository root only";
export const CANVAS_FILENAME = "code-readiness.canvas.tsx";
export const SIDECAR_FILENAME = "code-readiness.canvas.data.json";
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const KODUS_TIMEOUT_MS = 180_000;
export const STRIP_ENV_KEYS = ["OPENAI_API_KEY", "KODUS_API_KEY"];
export const CONFIG_FILENAMES = [".kodus-readiness.yml", ".kodus-readiness.yaml"];
export const LEVEL_LABELS = {
  1: "Foundational",
  2: "Guided",
  3: "Structured",
  4: "Optimized",
  5: "Autonomous",
};
export const AI_CRITERION_IDS = [
  "naming-conventions",
  "test-quality",
  "readme-quality",
  "docs-agent-friendliness",
];
