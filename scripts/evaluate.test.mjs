import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCatalog, skillRoot } from "./catalog.mjs";
import { ATTRIBUTION, LEVEL_THRESHOLD, thresholdForLevel } from "./constants.mjs";
import { evaluateRepo, LOCK_FILES, scoreResults } from "./evaluate.mjs";
import { buildReport } from "./report.mjs";
import { globMatch } from "./walk.mjs";

const tmpDirs = [];
function tmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

const CORE_IDS = [
  "license",
  "readme",
  "lock-file",
  "editorconfig",
  "linter",
  "formatter",
  "test-files-exist",
  "test-script",
  "contributing",
  "ci-config",
  "pre-commit-hooks",
  "codeowners",
  "ai-context",
  "dep-update-automation",
  "ci-runs-tests",
  "type-checker",
];

const catalog = loadCatalog();
assert.equal(catalog.pillars.length, 7);
assert.equal(catalog.criteria.length, 39);
assert.equal(catalog.v1SkipLLM, true);
assert.equal(catalog.level1Threshold, 0.75);
assert.equal(catalog.levelThreshold, 0.8);
for (const id of CORE_IDS) {
  assert.ok(
    catalog.criteria.some((row) => row.id === id),
    `missing core id ${id}`,
  );
}
assert.deepEqual(
  catalog.criteria.filter((row) => row.requiresLLM).map((row) => row.id).sort(),
  ["docs-agent-friendliness", "naming-conventions", "readme-quality", "test-quality"],
);
function countedAt(level) {
  return catalog.criteria.filter((row) => row.level === level && !row.requiresLLM).length;
}
assert.equal(countedAt(1), 4);
assert.equal(countedAt(2), 10);
assert.equal(countedAt(3), 12);
assert.equal(countedAt(4), 8);
assert.equal(countedAt(5), 1);

assert.equal(thresholdForLevel(1), 0.75);
assert.equal(thresholdForLevel(2), LEVEL_THRESHOLD);
assert.equal(thresholdForLevel(5), LEVEL_THRESHOLD);

const lockFile = catalog.criteria.find((row) => row.id === "lock-file");
assert.deepEqual(lockFile.anyFiles, LOCK_FILES);
assert.ok(LOCK_FILES.includes("uv.lock"));
assert.ok(LOCK_FILES.includes("pdm.lock"));
assert.ok(LOCK_FILES.includes("npm-shrinkwrap.json"));

const aiContext = catalog.criteria.find((row) => row.id === "ai-context");
assert.ok(aiContext);
assert.equal(aiContext.anyFiles.includes("AGENTS.md"), true);
assert.equal(aiContext.anyFiles.includes(".github/AGENTS.md"), true);
assert.equal(/does not look for AGENTS\.md/i.test(aiContext.fix), false);

const contributing = catalog.criteria.find((row) => row.id === "contributing");
assert.ok(contributing.anyFiles.includes("**/CONTRIBUTING.md"));
assert.ok(contributing.anyFiles.includes("docs/**/contributing*"));

assert.equal(globMatch("scripts/foo.test.mjs", "**/*.test.*"), true);
assert.equal(globMatch(".github/workflows/ci.yml", ".github/workflows/*.yml"), true);
assert.equal(globMatch("src/foo.js", "**/*.test.*"), false);
assert.equal(globMatch("docs/en/docs/contributing.md", "docs/**/contributing*"), true);
assert.equal(globMatch("docs/en/docs/CONTRIBUTING.md", "**/CONTRIBUTING.md"), true);

function resultById(evaluation) {
  return Object.fromEntries(evaluation.results.map((row) => [row.criterionId, row]));
}

function fakeRow(criterion, { pass = false, skipped = false } = {}) {
  return {
    criterionId: criterion.id,
    name: criterion.name,
    pillarId: criterion.pillarId,
    level: criterion.level,
    requiresLLM: Boolean(criterion.requiresLLM),
    pass,
    skipped: skipped || Boolean(criterion.requiresLLM),
    message: "",
  };
}

function catalogRows({ l1Pass, l2Pass }) {
  return catalog.criteria.map((criterion) => {
    if (criterion.requiresLLM) return fakeRow(criterion, { skipped: true });
    if (criterion.level === 1) return fakeRow(criterion, { pass: l1Pass(criterion) });
    if (criterion.level === 2) return fakeRow(criterion, { pass: l2Pass(criterion) });
    return fakeRow(criterion, { pass: false });
  });
}

const l1ThreeOfFour = catalogRows({
  l1Pass: (criterion) => criterion.id !== "editorconfig",
  l2Pass: () => true,
});
const scoredL1 = scoreResults(catalog, l1ThreeOfFour);
assert.equal(scoredL1.level, 2, "L1 3/4 plus complete L2 should reach Guided");
assert.equal(scoredL1.l1Passed, 3);
assert.equal(scoredL1.l1Total, 4);
assert.equal(scoredL1.l2Passed, 10);
assert.equal(scoredL1.l2Total, 10);
assert.equal(scoredL1.nextLevelProgress.needed, Math.ceil(12 * LEVEL_THRESHOLD));

const l1TwoMisses = catalogRows({
  l1Pass: (criterion) => criterion.id !== "editorconfig" && criterion.id !== "license",
  l2Pass: () => true,
});
const scoredTwoMiss = scoreResults(catalog, l1TwoMisses);
assert.equal(scoredTwoMiss.level, 1, "two L1 misses still cap at Foundational");
assert.equal(scoredTwoMiss.l1Passed, 2);
assert.equal(scoredTwoMiss.nextLevelProgress.needed, Math.ceil(10 * LEVEL_THRESHOLD));

const root = tmp("code-readiness-");
fs.writeFileSync(path.join(root, "LICENSE"), "MIT\n");
fs.writeFileSync(
  path.join(root, "README.md"),
  `${"A".repeat(520)}\n# sample\nsetup and usage.\n`,
);
fs.writeFileSync(path.join(root, ".editorconfig"), "root = true\n");
fs.writeFileSync(
  path.join(root, "package.json"),
  JSON.stringify({ scripts: { test: "node test.js", dev: "node ." }, devDependencies: { eslint: "9.0.0" } }),
);
fs.writeFileSync(path.join(root, "package-lock.json"), "{}\n");
fs.writeFileSync(path.join(root, "eslint.config.js"), "export default [];\n");
fs.writeFileSync(path.join(root, "app.test.js"), "test('ok', () => {});\n");
fs.writeFileSync(path.join(root, ".nvmrc"), "20\n");
fs.writeFileSync(path.join(root, "AGENTS.md"), "# agents\n");

const evalJs = evaluateRepo(root);
const byId = resultById(evalJs);
assert.equal(byId.license.pass, true);
assert.equal(byId.readme.pass, true);
assert.equal(byId.editorconfig.pass, true);
assert.equal(byId["lock-file"].pass, true);
assert.equal(byId.linter.pass, true);
assert.equal(byId["test-files-exist"].pass, true);
assert.equal(byId["test-script"].pass, true);
assert.equal(byId["version-pinned"].pass, true);
assert.equal(byId["naming-conventions"].skipped, true);
assert.equal(byId["test-quality"].skipped, true);
assert.equal(byId["readme-quality"].skipped, true);
assert.equal(byId["docs-agent-friendliness"].skipped, true);
assert.equal(byId["ai-context"].pass, true, "AGENTS.md satisfies ai-context");

const scored = scoreResults(evalJs.catalog, evalJs.results);
assert.equal(scored.level, 1);
assert.ok(scored.scorePercent > 0);
assert.equal(scored.l1Passed, 4);
assert.equal(scored.l1Total, 4);

function writeGuidedMinusEditorconfig(dir) {
  fs.writeFileSync(path.join(dir, "LICENSE"), "MIT\n");
  fs.writeFileSync(
    path.join(dir, "README.md"),
    `${"A".repeat(520)}\n# sample\nsetup and usage.\n`,
  );
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      scripts: { test: "node test.js", dev: "node ." },
      devDependencies: { eslint: "9.0.0", jest: "29.0.0", prettier: "3.0.0" },
    }),
  );
  fs.writeFileSync(path.join(dir, "package-lock.json"), "{}\n");
  fs.writeFileSync(path.join(dir, "eslint.config.js"), "export default [];\n");
  fs.writeFileSync(path.join(dir, ".prettierrc"), "{}\n");
  fs.writeFileSync(path.join(dir, "app.test.js"), "test('ok', () => {});\n");
  fs.writeFileSync(path.join(dir, "CONTRIBUTING.md"), "# contributing\n");
  fs.writeFileSync(path.join(dir, ".env.example"), "FOO=\n");
  fs.writeFileSync(path.join(dir, ".nvmrc"), "20\n");
  fs.mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".github", "workflows", "ci.yml"), "name: ci\n");
}

const l1MissEditor = tmp("code-readiness-l1-");
writeGuidedMinusEditorconfig(l1MissEditor);
const l1MissEval = evaluateRepo(l1MissEditor);
const l1MissById = resultById(l1MissEval);
assert.equal(l1MissById.editorconfig.pass, false);
assert.equal(l1MissById.license.pass, true);
assert.equal(l1MissById.readme.pass, true);
assert.equal(l1MissById["lock-file"].pass, true);
const l1MissScored = scoreResults(l1MissEval.catalog, l1MissEval.results);
assert.equal(l1MissScored.l1Passed, 3);
assert.equal(l1MissScored.l1Total, 4);
assert.ok(l1MissScored.l2Passed / l1MissScored.l2Total >= LEVEL_THRESHOLD);
assert.equal(l1MissScored.level, 2, "missing only .editorconfig still reaches Guided");

const goRoot = tmp("code-readiness-go-");
fs.writeFileSync(path.join(goRoot, "go.mod"), "module example.com/x\n\ngo 1.22\n");
const goEval = evaluateRepo(goRoot);
const goById = resultById(goEval);
assert.equal(goById.formatter.pass, true, goById.formatter.message);
assert.equal(goById["type-checker"].pass, true, goById["type-checker"].message);
assert.equal(goById["version-pinned"].pass, true);

const rustRoot = tmp("code-readiness-rs-");
fs.writeFileSync(path.join(rustRoot, "Cargo.toml"), "[package]\nname = \"x\"\nversion = \"0.1.0\"\n");
const rustEval = evaluateRepo(rustRoot);
const rustById = resultById(rustEval);
assert.equal(rustById.formatter.pass, true, rustById.formatter.message);
assert.equal(rustById["type-checker"].pass, true, rustById["type-checker"].message);

const javaRoot = tmp("code-readiness-java-");
fs.writeFileSync(path.join(javaRoot, "pom.xml"), "<project></project>\n");
const javaEval = evaluateRepo(javaRoot);
const javaById = resultById(javaEval);
assert.equal(javaById["type-checker"].pass, true, javaById["type-checker"].message);
assert.equal(javaById.formatter.pass, false);
assert.equal(javaById["lock-file"].skipped, true, javaById["lock-file"].message);
assert.match(javaById["lock-file"].message, /no conventional committed lockfile/i);
assert.equal(javaById["lock-file"].pass, false);

const uvRoot = tmp("code-readiness-uv-");
fs.writeFileSync(path.join(uvRoot, "pyproject.toml"), "[project]\nname = \"x\"\nversion = \"0.1.0\"\n");
fs.writeFileSync(path.join(uvRoot, "uv.lock"), "# uv lock\n");
const uvEval = evaluateRepo(uvRoot);
const uvById = resultById(uvEval);
assert.equal(uvById["lock-file"].pass, true, uvById["lock-file"].message);
assert.equal(uvById["lock-file"].skipped, false);
assert.match(uvById["lock-file"].message, /uv\.lock/);

const envSkipRoot = tmp("code-readiness-env-skip-");
fs.writeFileSync(path.join(envSkipRoot, "index.js"), "export default {}\n");
const envSkipEval = evaluateRepo(envSkipRoot);
const envSkipById = resultById(envSkipEval);
assert.equal(envSkipById["env-documentation"].skipped, true, envSkipById["env-documentation"].message);
assert.equal(envSkipById["env-documentation"].pass, false);

const envFailRoot = tmp("code-readiness-env-fail-");
fs.writeFileSync(path.join(envFailRoot, "docker-compose.yml"), "services: {}\n");
const envFailEval = evaluateRepo(envFailRoot);
const envFailById = resultById(envFailEval);
assert.equal(envFailById["env-documentation"].skipped, false);
assert.equal(envFailById["env-documentation"].pass, false, envFailById["env-documentation"].message);

const nestedRoot = tmp("code-readiness-contrib-");
fs.mkdirSync(path.join(nestedRoot, "docs", "en", "docs"), { recursive: true });
fs.writeFileSync(path.join(nestedRoot, "docs", "en", "docs", "contributing.md"), "# contributing\n");
const nestedEval = evaluateRepo(nestedRoot);
const nestedById = resultById(nestedEval);
assert.equal(nestedById.contributing.pass, true, nestedById.contributing.message);
assert.match(nestedById.contributing.message, /docs\/en\/docs\/contributing\.md/);

const emptyRoot = tmp("code-readiness-empty-");
const emptyEval = evaluateRepo(emptyRoot);
const emptyById = resultById(emptyEval);
const emptyScored = scoreResults(emptyEval.catalog, emptyEval.results);
assert.equal(emptyScored.level, 1);
assert.equal(emptyById["env-documentation"].skipped, true);
assert.equal(emptyById["lock-file"].skipped, false);
assert.equal(
  emptyEval.results.filter((row) => row.skipped).length,
  5,
);

const capRoot = tmp("code-readiness-cap-");
fs.mkdirSync(path.join(capRoot, ".github", "workflows"), { recursive: true });
fs.writeFileSync(
  path.join(capRoot, "README.md"),
  `${"A".repeat(520)}\n# sample\nsetup and usage.\n`,
);
fs.writeFileSync(
  path.join(capRoot, "package.json"),
  JSON.stringify({ scripts: { test: "node test.js", dev: "node ." }, devDependencies: { eslint: "9.0.0" } }),
);
fs.writeFileSync(path.join(capRoot, "package-lock.json"), "{}\n");
fs.writeFileSync(path.join(capRoot, "eslint.config.js"), "export default [];\n");
fs.writeFileSync(path.join(capRoot, ".prettierrc"), "{}\n");
fs.writeFileSync(path.join(capRoot, "jest.config.js"), "export default {};\n");
fs.writeFileSync(path.join(capRoot, "app.test.js"), "test('ok', () => {});\n");
fs.writeFileSync(path.join(capRoot, "CONTRIBUTING.md"), "how to contribute\n");
fs.writeFileSync(path.join(capRoot, ".env.example"), "TOKEN=\n");
fs.writeFileSync(path.join(capRoot, ".nvmrc"), "20\n");
fs.writeFileSync(path.join(capRoot, ".github", "workflows", "ci.yml"), "on: push\n");
const capEval = evaluateRepo(capRoot);
const capReport = buildReport(capEval, { repoRoot: capRoot, repoName: "cap" });
assert.equal(capReport.maturity_level.level, 1);
assert.equal(capReport.maturity_level.l1Capped, true);
assert.ok(capReport.maturity_level.l1CapReasons.includes("editorconfig"));
assert.ok(capReport.maturity_level.l1CapReasons.includes("license"));
assert.equal(capReport.maturity_level.l1Passed, 2);
assert.equal(capReport.maturity_level.l1Total, 4);
assert.ok(capReport.maturity_level.l2Total >= 8);
assert.ok(
  capReport.maturity_level.l2Passed / capReport.maturity_level.l2Total >= 0.8,
);

assert.equal(/factory|kodus/i.test(ATTRIBUTION), false);
function walkTextFiles(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walkTextFiles(full, acc);
    else if (/\.(md|mjs|tsx|ts|json)$/.test(name)) acc.push(full);
  }
  return acc;
}
for (const file of walkTextFiles(skillRoot())) {
  if (file.endsWith(`${path.sep}evaluate.test.mjs`)) continue;
  const text = fs.readFileSync(file, "utf8").replaceAll("kodustech/agent-readiness", "");
  assert.equal(/factory|kodus/i.test(text), false, file);
}

for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
process.stdout.write("evaluate.test.mjs ok\n");
