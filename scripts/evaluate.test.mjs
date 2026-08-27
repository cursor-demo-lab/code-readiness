import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { catalogPath, loadCatalog, skillRoot } from "./catalog.mjs";
import { ATTRIBUTION, CI_GLOBS, IGNORE_DIRS, LEVEL_LABELS, LEVEL_THRESHOLD, TEST_FILE_GLOBS, thresholdForLevel } from "./constants.mjs";
import { CASE_INSENSITIVE_NAME_IDS, evaluateRepo, LOCK_FILES, recommend, scoreResults } from "./evaluate.mjs";
import { buildReport, chatFixFile, chatLines } from "./report.mjs";
import { ciFiles, detectLanguages, detectManifestLanguages, findMatches, globMatch, globToRegExp, testFiles } from "./walk.mjs";

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
assert.deepEqual(
  catalog.pillars.map((pillar) => pillar.id),
  [
    "style-linting",
    "testing",
    "documentation",
    "dev-environment",
    "ci-cd",
    "code-health",
    "security",
  ],
);
const stylePillar = catalog.pillars.find((pillar) => pillar.id === "style-linting");
assert.ok(stylePillar);
assert.equal(stylePillar.id, "style-linting");
assert.equal(stylePillar.name, "Style & Validation");
assert.deepEqual(
  catalog.criteria
    .filter((row) => row.pillarId === "style-linting")
    .map((row) => row.id)
    .sort(),
  [
    "editorconfig",
    "formatter",
    "linter",
    "naming-conventions",
    "pre-commit-hooks",
    "type-checker",
  ],
);
assert.equal(catalog.criteria.length, 40);
assert.equal(catalog.v1SkipLLM, true);
assert.equal(catalog.level1Threshold, 0.8);
assert.equal(catalog.levelThreshold, 0.8);
assert.deepEqual(LEVEL_LABELS, {
  1: "Functional",
  2: "Documented",
  3: "Standardized",
  4: "Optimized",
  5: "Autonomous",
});
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
assert.equal(countedAt(2), 13);
assert.equal(countedAt(3), 10);
assert.equal(countedAt(4), 8);
assert.equal(countedAt(5), 1);

assert.equal(thresholdForLevel(1), 0.8);
assert.equal(thresholdForLevel(2), LEVEL_THRESHOLD);
assert.equal(thresholdForLevel(5), LEVEL_THRESHOLD);
assert.equal(thresholdForLevel(1), thresholdForLevel(2));

const editorconfig = catalog.criteria.find((row) => row.id === "editorconfig");
assert.equal(editorconfig.level, 2);
assert.equal(editorconfig.pillarId, "style-linting");
assert.deepEqual(
  catalog.criteria.filter((row) => row.level === 1).map((row) => row.id).sort(),
  ["linter", "readme", "test-files-exist", "type-checker"],
);
assert.equal(catalog.criteria.find((row) => row.id === "license").level, 2);
assert.equal(catalog.criteria.find((row) => row.id === "lock-file").level, 2);
assert.equal(catalog.criteria.find((row) => row.id === "linter").level, 1);
assert.equal(catalog.criteria.find((row) => row.id === "test-files-exist").level, 1);
assert.equal(catalog.criteria.find((row) => row.id === "type-checker").level, 1);
assert.equal(catalog.criteria.find((row) => row.id === "ai-context").level, 2);
assert.equal(catalog.criteria.find((row) => row.id === "pre-commit-hooks").level, 2);
assert.equal(catalog.criteria.find((row) => row.id === "ci-config").level, 2);
assert.equal(catalog.criteria.find((row) => row.id === "containerization").level, 3);
assert.equal(catalog.criteria.find((row) => row.id === "branch-protection").level, 4);
assert.equal(catalog.criteria.find((row) => row.id === "e2e-tests").level, 4);

const lockFile = catalog.criteria.find((row) => row.id === "lock-file");
assert.deepEqual(lockFile.anyFiles, LOCK_FILES);
assert.ok(LOCK_FILES.includes("uv.lock"));
assert.ok(LOCK_FILES.includes("pdm.lock"));
assert.ok(LOCK_FILES.includes("npm-shrinkwrap.json"));
assert.ok(LOCK_FILES.includes("mix.lock"));
assert.ok(LOCK_FILES.includes("flake.lock"));
assert.ok(LOCK_FILES.includes("cabal.project.freeze"));
assert.ok(LOCK_FILES.includes("pixi.lock"));

const aiContext = catalog.criteria.find((row) => row.id === "ai-context");
assert.ok(aiContext);
assert.equal(aiContext.anyFiles.includes("AGENTS.md"), true);
assert.equal(aiContext.anyFiles.includes(".github/AGENTS.md"), true);
assert.ok(aiContext.anyFiles.includes("CLAUDE.md"));
assert.ok(aiContext.anyFiles.includes(".github/copilot-instructions.md"));
assert.ok(aiContext.anyFiles.includes(".cursorrules"));
assert.ok(aiContext.anyFiles.includes("GEMINI.md"));
assert.ok(aiContext.anyFiles.includes(".github/instructions/**/*.md"));
assert.ok(aiContext.anyFiles.includes(".windsurfrules"));
assert.ok(aiContext.anyFiles.includes("WARP.md"));
assert.ok(
  aiContext.anyFiles.indexOf("AGENTS.md") < aiContext.anyFiles.indexOf("CLAUDE.md"),
  "AGENTS.md must precede CLAUDE.md so first-hit names the onboarding doc",
);
assert.ok(
  aiContext.anyFiles.indexOf(".github/AGENTS.md") < aiContext.anyFiles.indexOf("CLAUDE.md"),
  ".github/AGENTS.md must precede CLAUDE.md",
);
assert.equal(/does not look for AGENTS\.md/i.test(aiContext.fix), false);

const contributing = catalog.criteria.find((row) => row.id === "contributing");
assert.ok(contributing.anyFiles.includes("**/CONTRIBUTING.md"));
assert.ok(contributing.anyFiles.includes("**/CONTRIBUTING.rst"));
assert.ok(contributing.anyFiles.includes("docs/**/contributing*"));
assert.ok(contributing.anyFiles.includes(".github/CONTRIBUTING.md"));
assert.ok(contributing.anyFiles.includes("CONTRIBUTING.rst"));
assert.ok(contributing.anyFiles.includes("CONTRIBUTING"));
assert.ok(contributing.anyFiles.includes(".github/CONTRIBUTING.rst"));
assert.equal(contributing.anyFilesNonEmpty, true, "empty contributing files must not pass on presence");
assert.equal(IGNORE_DIRS.has(".github"), false);
assert.equal(IGNORE_DIRS.has(".cursor"), true);

const linter = catalog.criteria.find((row) => row.id === "linter");
assert.ok(linter.anyFiles.includes("ruff.toml"));
assert.ok(linter.anyFiles.includes(".ruff.toml"));
assert.ok(linter.anyFiles.includes(".oxlintrc.json"));
assert.ok(linter.anyFiles.includes("biome.json"));
assert.ok(linter.anyFiles.includes("biome.jsonc"));
assert.ok(linter.anyFiles.includes("eslint.config.*"));
assert.ok(linter.anyFiles.includes(".golangci.yml"));
assert.ok(linter.anyFiles.includes(".golangci.yaml"));
assert.ok(linter.anyFiles.includes(".golangci.toml"));
assert.ok(linter.anyFiles.includes(".golangci.json"));
for (const name of [
  ".flake8",
  ".pylintrc",
  "pylintrc",
  "clippy.toml",
  ".clippy.toml",
  ".clang-tidy",
  ".hlint.yaml",
  "hlint.yaml",
  ".credo.exs",
  ".tflint.hcl",
  ".shellcheckrc",
  ".luacheckrc",
  ".jshintrc",
]) {
  assert.ok(linter.anyFiles.includes(name), `linter missing ${name}`);
}
assert.equal(linter.anyFiles.includes(".clang-format"), false);
assert.equal(linter.anyFiles.includes("rustfmt.toml"), false);
assert.ok(linter.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.ruff")));
assert.ok(linter.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.ruff.lint]")));
assert.ok(linter.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.pylint")));
assert.ok(linter.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.flake8")));
assert.ok(linter.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("\"biome\"")));
assert.ok(linter.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("\"oxlint\"")));
assert.ok(linter.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("\"standard\"")));
assert.ok(linter.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("\"xo\"")));
assert.ok(linter.fileContains.some((rule) => rule.file === "setup.cfg" && rule.includes.includes("[flake8]")));
assert.ok(linter.fileContains.some((rule) => rule.file === "Cargo.toml" && rule.includes.includes("[lints.clippy")));
assert.ok(linter.fileContains.some((rule) => rule.file === "Cargo.toml" && rule.includes.includes("[workspace.lints")));
assert.ok(linter.fileContains.some((rule) => rule.file === "Cargo.toml" && rule.includes.includes("[lints.rust")));
assert.ok(linter.fileContains.some((rule) => rule.file === "pom.xml" && rule.includes.includes("errorprone")));
assert.ok(linter.fileContains.some((rule) => rule.file === "pom.xml" && rule.includes.includes("error_prone")));
assert.ok(linter.fileContains.some((rule) => rule.file === "pom.xml" && rule.includes.includes("error_prone_core")));
assert.equal(
  linter.fileContains.some((rule) => (rule.includes ?? []).includes("spotless")),
  false,
  "spotless is a formatter, not a linter",
);
assert.equal(linter.anyFiles.includes(".php-cs-fixer.php"), false);
assert.equal(linter.anyFiles.includes(".formatter.exs"), false);
assert.equal(linter.languagesPass, undefined);
assert.equal(linter.anyFilesNonEmpty, undefined, "empty optional linter configs still count");
assert.equal(
  (linter.ignorePathSegments ?? []).includes("packages"),
  false,
  "packages/.eslintrc is a real monorepo linter when no root file exists",
);
for (const formatterFile of [".prettierrc", "rustfmt.toml", ".rustfmt.toml", ".clang-format"]) {
  assert.equal(
    linter.anyFiles.includes(formatterFile),
    false,
    `${formatterFile} is a formatter, not a linter`,
  );
}

const formatter = catalog.criteria.find((row) => row.id === "formatter");
assert.ok(formatter.anyFiles.includes(".prettierrc"));
assert.ok(formatter.anyFiles.includes(".prettierrc.*"));
assert.ok(formatter.anyFiles.includes("prettier.config.*"));
assert.ok(formatter.anyFiles.includes(".dprint.json"));
assert.ok(formatter.anyFiles.includes(".dprint.jsonc"));
assert.ok(formatter.anyFiles.includes("dprint.json"));
assert.ok(formatter.anyFiles.includes("rustfmt.toml"));
assert.ok(formatter.anyFiles.includes(".rustfmt.toml"));
assert.ok(formatter.anyFiles.includes(".rubocop.yml"));
assert.ok(formatter.anyFiles.includes(".rubocop.yaml"));
assert.ok(formatter.anyFiles.includes(".standard.yml"));
assert.ok(formatter.anyFiles.includes(".clang-format"));
assert.ok(formatter.anyFiles.includes(".swift-format"));
assert.ok(formatter.anyFiles.includes(".swiftformat"));
assert.ok(formatter.anyFiles.includes(".scalafmt.conf"));
assert.ok(formatter.anyFiles.includes(".php-cs-fixer.php"));
assert.ok(formatter.anyFiles.includes(".formatter.exs"));
assert.ok(formatter.anyFiles.includes(".style.yapf"));
assert.ok(formatter.anyFiles.includes("ruff.toml"));
assert.ok(formatter.anyFiles.includes(".ruff.toml"));
assert.ok(formatter.anyFiles.includes(".black"));
assert.equal(formatter.anyFiles.includes(".clang-tidy"), false);
assert.equal(formatter.anyFiles.includes("mix.exs"), false);
assert.equal(formatter.languagesPass.elixir, undefined);
assert.ok(formatter.fileContains.some((rule) => rule.file === "pom.xml" && rule.includes.includes("spotless")));
assert.ok(formatter.fileContains.some((rule) => rule.file === "build.gradle" && rule.includes.includes("spotless")));
assert.ok(formatter.fileContains.some((rule) => rule.file === "biome.json" && rule.includes.includes("formatter")));
assert.ok(formatter.fileContains.some((rule) => rule.file === "biome.jsonc" && rule.includes.includes("formatter")));
assert.ok(formatter.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.black]")));
assert.ok(formatter.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.ruff")));
assert.ok(formatter.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("\"prettier\"")));
assert.equal(formatter.languagesPass.go, "Go has built-in formatting via gofmt.");
assert.match(formatter.fix, /dprint/);
assert.equal(formatter.anyFilesNonEmpty, true, "empty formatter configs must not pass on presence");
assert.ok(formatter.ignorePathSegments.includes("deps"));
assert.ok(formatter.ignorePathSegments.includes("vendor"));
assert.ok(formatter.ignorePathSegments.includes("third_party"));
assert.ok(formatter.ignorePathSegments.includes("third-party"));
assert.equal(
  formatter.ignorePathSegments.includes("examples"),
  false,
  "examples/.prettierrc can be a real monorepo formatter",
);

const typeChecker = catalog.criteria.find((row) => row.id === "type-checker");
assert.ok(typeChecker.anyFiles.includes("tsconfig.json"));
assert.equal(typeChecker.anyFiles.includes("**/tsconfig.json"), false);
assert.ok(typeChecker.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.ty]")));
assert.ok(typeChecker.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.basedpyright]")));
assert.ok(typeChecker.anyFiles.includes("mypy.ini"));
assert.ok(typeChecker.fileContains.some((rule) => rule.file === "setup.cfg" && rule.includes.includes("[mypy]")));
assert.ok(typeChecker.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.mypy]")));
assert.ok(typeChecker.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.pyright]")));
assert.equal(typeChecker.tsconfigStrict, true);
assert.equal(typeChecker.languagesPass.csharp, "C# has a built-in static type system.");
assert.equal(typeChecker.languagesPass.elixir, undefined);

const testFramework = catalog.criteria.find((row) => row.id === "test-framework");
assert.ok(testFramework.anyFiles.includes("conftest.py"));
assert.ok(testFramework.anyFiles.includes("tests/conftest.py"));
assert.ok(testFramework.anyFiles.includes("**/conftest.py"));
assert.ok(testFramework.anyFiles.includes("phpunit.xml"));
assert.ok(testFramework.anyFiles.includes("phpunit.xml.dist"));
assert.ok(testFramework.anyFiles.includes(".rspec"));
assert.ok(testFramework.anyFiles.includes("spec/spec_helper.rb"));
assert.ok(testFramework.anyFiles.includes("test/test_helper.rb"));
assert.ok(testFramework.anyGlobs.includes("**/tests/**/*.rs"));
assert.ok(testFramework.anyGlobs.includes("**/*_test.rs"));
assert.equal(testFramework.anyFiles.includes("Cargo.toml"), false);
assert.equal(testFramework.anyFiles.includes("*.csproj"), false);
assert.equal(testFramework.anyFiles.includes("**/*.csproj"), false);
assert.ok(testFramework.anyFiles.includes("**/*Tests.csproj"));
assert.ok(testFramework.anyFiles.includes("**/*Test.csproj"));
assert.ok(testFramework.anyFiles.includes("test/test_helper.exs"));
assert.ok(testFramework.anyGlobs.includes("**/*_test.exs"));
assert.ok(testFramework.anyGlobs.includes("**/*_spec.exs"));
assert.ok(testFramework.anyGlobs.includes("**/*_spec.rb"));
assert.ok(testFramework.anyGlobs.includes("**/*_test.rb"));
assert.ok(testFramework.anyGlobs.includes("**/test_*.py"));
assert.ok(testFramework.anyGlobs.includes("**/*_test.py"));
assert.ok(testFramework.anyGlobs.includes("**/*Test.java"));
assert.ok(testFramework.anyGlobs.includes("**/*Tests.java"));
assert.ok(testFramework.anyGlobs.includes("**/*Test.cs"));
assert.ok(testFramework.anyGlobs.includes("**/*Tests.cs"));
assert.ok(testFramework.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.pytest")));
assert.ok(testFramework.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("\"node --test\"")));
assert.ok(testFramework.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("node --test")));
assert.ok(testFramework.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("node -- --test")));
assert.ok(testFramework.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("node:test")));
assert.ok(testFramework.fileContains.some((rule) => rule.file === "pom.xml" && rule.includes.includes("junit")));
assert.ok(
  testFramework.fileContains.some(
    (rule) =>
      (rule.file === "*.csproj" || rule.file === "**/*.csproj") &&
      rule.includes.includes("xunit") &&
      rule.includes.includes("nunit") &&
      rule.includes.includes("MSTest"),
  ),
);
assert.equal(
  [...(testFramework.anyFiles ?? []), ...(testFramework.anyGlobs ?? [])].some((pattern) =>
    pattern.includes(".test.js"),
  ),
  false,
  "test-framework must not treat **/*.test.js as a framework (that is test-files-exist)",
);

const versionPinned = catalog.criteria.find((row) => row.id === "version-pinned");
assert.ok(versionPinned.anyFiles.includes("go.mod"));
assert.equal(versionPinned.anyFiles.includes(".tool-versions"), false, "empty .tool-versions must not pass on presence");
assert.equal(versionPinned.anyFiles.includes(".nvmrc"), false, "empty .nvmrc must not pass on presence");
assert.equal(versionPinned.anyFiles.includes(".python-version"), false);
assert.equal(versionPinned.anyFiles.includes(".go-version"), false);
assert.ok(versionPinned.fileContains.some((rule) => rule.file === ".tool-versions"));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === ".nvmrc"));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === ".python-version"));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === ".go-version"));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "runtime.txt" && rule.includes.includes("python-")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "pom.xml" && rule.includes.includes("maven.compiler.source")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "pom.xml" && rule.includes.includes("maven.compiler.release")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "build.gradle" && rule.includes.includes("jvmToolchain")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "build.gradle.kts" && rule.includes.includes("sourceCompatibility")));
assert.ok(
  versionPinned.fileContains.some(
    (rule) =>
      rule.file === "**/*.gradle.kts" &&
      rule.includes.includes("jvmToolchain") &&
      rule.includes.includes("JavaLanguageVersion") &&
      !rule.includes.includes("sourceCompatibility"),
  ),
);
assert.ok(
  versionPinned.fileContains.some(
    (rule) =>
      rule.file === "**/*.gradle" &&
      rule.includes.includes("jvmToolchain") &&
      rule.includes.includes("JavaLanguageVersion"),
  ),
);
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("requires-python")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "setup.py" && rule.includes.includes("python_requires")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("\"engines\"")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("\"packageManager\"")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "Cargo.toml" && rule.includes.includes("rust-version")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "Gemfile" && rule.includes.includes("ruby \"")));
assert.ok(
  versionPinned.fileContains.some(
    (rule) => rule.file === "**/*.gemspec" && rule.includes.includes("required_ruby_version"),
  ),
);
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "mix.exs" && rule.includes.includes("elixir:")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "composer.json" && rule.includes.includes("\"php\":")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "Package.swift" && rule.includes.includes("swift-tools-version")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "**/*.csproj" && rule.includes.includes("<TargetFramework")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "build.sbt" && rule.includes.includes("scalaVersion")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "stack.yaml" && rule.includes.includes("resolver")));
assert.ok(versionPinned.fileContains.some((rule) => rule.file === "**/*.cabal" && rule.includes.includes("cabal-version:")));
assert.ok(
  versionPinned.fileContains.some(
    (rule) =>
      rule.file === "CMakeLists.txt" &&
      rule.includes.includes("CMAKE_CXX_STANDARD") &&
      rule.includes.includes("CMAKE_C_STANDARD") &&
      rule.includes.includes("PROPERTY CXX_STANDARD") &&
      rule.includes.includes("PROPERTIES CXX_STANDARD") &&
      (rule.ignorePathSegments ?? []).includes("docs"),
  ),
);
assert.equal(
  versionPinned.fileContains.some((rule) => (rule.includes ?? []).includes("CXX_STANDARD")),
  false,
  "bare CXX_STANDARD is a substring of the test-helper identifier CXX_STANDARDS",
);
assert.equal(
  (versionPinned.fileContains.find((rule) => rule.file === "CMakeLists.txt")?.ignorePathSegments ?? []).includes(
    "tests",
  ),
  false,
  "do not ignore tests/ for CMake pins; the token, not the path, was the false positive",
);
assert.equal(
  versionPinned.anyFiles.includes("setup.py"),
  false,
  "empty setup.py must not pass version-pinned; only python_requires counts",
);
assert.equal(
  versionPinned.fileContains.some((rule) => (rule.includes ?? []).some((token) => /target-version/i.test(token))),
  false,
  "ruff target-version is not a runtime pin",
);

const setupScript = catalog.criteria.find((row) => row.id === "setup-script");
assert.ok(setupScript.anyFiles.includes("Makefile"));
assert.ok(setupScript.anyFiles.includes("scripts/install"));
assert.ok(setupScript.anyFiles.includes("scripts/install.sh"));
assert.ok(setupScript.anyFiles.includes("scripts/install-*"));
assert.ok(setupScript.anyFiles.includes("setup.py"));
assert.ok(setupScript.anyFiles.includes("setup.cfg"));
assert.ok(setupScript.anyFiles.includes("justfile"));
assert.ok(setupScript.anyFiles.includes("Justfile"));
assert.ok(setupScript.anyFiles.includes("Taskfile.yml"));
assert.ok(setupScript.anyFiles.includes("Taskfile.yaml"));
assert.ok(setupScript.anyFiles.includes("bootstrap.sh"));
assert.ok(setupScript.anyFiles.includes("scripts/bootstrap*"));
assert.ok(setupScript.anyFiles.includes("Cargo.toml"));
assert.ok(setupScript.anyFiles.includes("pom.xml"));
assert.ok(setupScript.anyFiles.includes("CMakeLists.txt"));
assert.ok(setupScript.anyFiles.includes("configure.ac"));
assert.ok(setupScript.anyFiles.includes("Gemfile"));
assert.ok(setupScript.anyFiles.includes("mix.exs"));
assert.ok(setupScript.anyFiles.includes("composer.json"));
assert.ok(setupScript.anyFiles.includes("Package.swift"));
assert.ok(setupScript.anyFiles.includes("build.sbt"));
assert.ok(setupScript.anyFiles.includes("build.gradle"));
assert.ok(setupScript.anyFiles.includes("build.gradle.kts"));
assert.ok(setupScript.anyFiles.includes("gradlew"));
assert.ok(
  setupScript.anyFiles.some((pattern) => pattern.includes(".csproj")),
  "setup-script must accept *.csproj, not only *.sln",
);
assert.equal(setupScript.anyFiles.includes("go.mod"), false);
assert.equal(setupScript.makefileTarget, "setup|install");
assert.match(String(setupScript.packageJsonPath), /scripts\.dev/);
assert.match(String(setupScript.packageJsonPath), /scripts\.test/);
assert.match(String(setupScript.packageJsonPath), /scripts\.lint/);
assert.match(String(setupScript.packageJsonPath), /scripts\.build/);
assert.ok(setupScript.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[build-system]")));

const testScript = catalog.criteria.find((row) => row.id === "test-script");
assert.equal(testScript.packageJsonPath, "scripts.test");
assert.equal(testScript.makefileTarget, "test");
assert.equal(testScript.anyFiles.includes("build.gradle"), false);
assert.equal(testScript.anyFiles.includes("build.gradle.kts"), false);
assert.equal(testScript.anyFiles.includes("*.csproj"), false);
assert.equal(testScript.anyFiles.includes("*.sln"), false);
assert.ok(testScript.anyFiles.includes("**/*Tests.csproj"));
assert.ok(testScript.anyFiles.includes("**/*Test.csproj"));
assert.ok(testScript.anyFiles.includes("**/*Tests.sln"));
assert.ok(testScript.anyFiles.includes("gradlew"));
assert.ok(testScript.anyFiles.includes("scripts/test"));
assert.ok(testScript.anyFiles.includes("scripts/test.sh"));
assert.ok(testScript.anyFiles.includes("scripts/test-*"));
assert.ok(testScript.anyFiles.includes("tox.ini"));
assert.ok(testScript.anyFiles.includes("tox.toml"));
assert.ok(testScript.anyFiles.includes("noxfile.py"));
assert.ok(testScript.anyFiles.includes("pytest.ini"));
assert.ok(testScript.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.pytest")));
assert.ok(testScript.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.tox")));
assert.ok(testScript.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.hatch.envs")));
assert.ok(testScript.fileRegex.some((rule) => rule.file === "justfile"));
assert.ok(testScript.fileRegex.some((rule) => rule.file === "Justfile"));
assert.ok(testScript.fileRegex.some((rule) => rule.file === "Taskfile.yml"));

const readme = catalog.criteria.find((row) => row.id === "readme");
assert.ok(readme.anyFiles.includes("README.md"));
assert.ok(readme.anyFiles.includes("README.rst"));
assert.ok(readme.anyFiles.includes("README.markdown"));
assert.ok(readme.anyFiles.includes("README.mkd"));
assert.equal(readme.minBytes, 500);

assert.deepEqual(
  [...CASE_INSENSITIVE_NAME_IDS].sort(),
  ["contributing", "license", "readme"],
  "casing is only ignored for the doc names where it carries no meaning",
);

const license = catalog.criteria.find((row) => row.id === "license");
assert.ok(license.anyFiles.includes("LICENSE-MIT"));
assert.ok(license.anyFiles.includes("LICENSE-*"));
assert.ok(license.anyFiles.includes("COPYING"));
assert.ok(license.anyFiles.includes("COPYING.md"));
assert.ok(license.anyFiles.includes("UNLICENSE"));
assert.ok(license.anyFiles.includes("LICENSE.rst"));
assert.ok(license.anyFiles.includes("LICENSES/**"));
assert.deepEqual(
  license.ignorePathSegments,
  formatter.ignorePathSegments,
  "license reuses formatter vendor segments, not a second list",
);
assert.equal(
  license.ignorePathSegments.includes("examples"),
  false,
  "examples/LICENSE can be a real product-tree license",
);
assert.equal(
  license.ignorePathSegments.includes("packages"),
  false,
  "packages/LICENSE is a real monorepo license when no root file exists",
);
assert.equal(license.anyFilesNonEmpty, undefined);

const preCommit = catalog.criteria.find((row) => row.id === "pre-commit-hooks");
assert.ok(preCommit.anyFiles.includes("lefthook.toml"));
assert.ok(preCommit.anyFiles.includes(".lefthook.yaml"));
assert.ok(preCommit.anyFiles.includes(".lintstagedrc"));
assert.ok(preCommit.anyFiles.includes(".lintstagedrc.*"));
assert.ok(preCommit.anyFiles.includes(".pre-commit-config.yaml"));
assert.ok(preCommit.anyFiles.includes(".pre-commit-config.yml"));
assert.ok(preCommit.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("\"husky\"")));
assert.ok(preCommit.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("\"lint-staged\"")));
assert.ok(preCommit.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("\"simple-git-hooks\"")));
assert.equal(preCommit.makefileTarget, undefined);

const apiDocs = catalog.criteria.find((row) => row.id === "api-docs");
assert.ok(apiDocs.anyFiles.includes("**/openapi.yaml"));
assert.ok(apiDocs.anyFiles.includes("**/openapi.yml"));
assert.ok(apiDocs.anyFiles.includes("**/swagger.yaml"));
assert.ok(apiDocs.anyFiles.includes("redocly.yaml"));
assert.ok(apiDocs.anyFiles.includes("typedoc.json"));
assert.equal(apiDocs.anyFiles.includes("mkdocs.yml"), false);
assert.equal(apiDocs.anyFiles.includes("conf.py"), false);

const codeowners = catalog.criteria.find((row) => row.id === "codeowners");
assert.equal(codeowners.level, 3);
assert.equal(codeowners.pillarId, "security");
assert.equal(
  codeowners.pillarId,
  catalog.criteria.find((row) => row.id === "security-policy").pillarId,
);
assert.equal(
  codeowners.pillarId,
  catalog.criteria.find((row) => row.id === "secrets-detection").pillarId,
);
assert.ok(codeowners.anyFiles.includes("docs/CODEOWNERS"));
assert.ok(codeowners.anyFiles.includes("CODEOWNERS"));
assert.ok(codeowners.anyFiles.includes(".github/CODEOWNERS"));

const issueTemplates = catalog.criteria.find((row) => row.id === "issue-templates");
assert.ok(issueTemplates);
assert.equal(issueTemplates.level, 3);
assert.equal(issueTemplates.pillarId, "documentation");
assert.ok(issueTemplates.anyFiles.includes(".github/ISSUE_TEMPLATE"));
assert.ok(issueTemplates.anyFiles.includes(".github/ISSUE_TEMPLATE.md"));
assert.ok(issueTemplates.anyFiles.includes(".github/ISSUE_TEMPLATE/**"));
assert.ok(issueTemplates.anyFiles.includes(".github/PULL_REQUEST_TEMPLATE.md"));
assert.ok(issueTemplates.anyFiles.includes(".github/pull_request_template.md"));
assert.ok(issueTemplates.anyFiles.includes(".github/PULL_REQUEST_TEMPLATE/**"));
assert.equal(
  catalog.criteria.filter((row) => row.id === "labels").length,
  0,
  "do not add a labels id",
);
assert.equal(catalog.criteria.filter((row) => row.id === "codeowners").length, 1);
assert.equal(catalog.criteria.filter((row) => row.id === "containerization").length, 1);

const architecture = catalog.criteria.find((row) => row.id === "architecture-docs");
assert.ok(architecture.anyFiles.includes("docs/adr/**"));
assert.ok(architecture.anyFiles.includes("docs/decisions/**"));
assert.ok(architecture.anyFiles.includes("adr/**"));

const envDoc = catalog.criteria.find((row) => row.id === "env-documentation");
assert.ok(envDoc.anyFiles.includes("env.example"));
assert.ok(envDoc.anyFiles.includes(".envrc.example"));
assert.ok(envDoc.anyFiles.includes("dotenv.example"));

const containerization = catalog.criteria.find((row) => row.id === "containerization");
assert.ok(containerization.anyFiles.includes("Dockerfile"));
assert.ok(containerization.anyFiles.includes("compose.yaml"));
assert.ok(containerization.anyFiles.includes("compose.yml"));
assert.ok(containerization.anyFiles.includes("Containerfile"));
assert.ok(containerization.anyFiles.includes(".devcontainer"));
assert.ok(containerization.anyFiles.includes(".devcontainer/devcontainer.json"));
assert.ok(containerization.anyFiles.includes(".cursor/environment.json"));
assert.equal(
  containerization.anyFiles.includes("environment.json"),
  false,
  "root environment.json is the wrong path; only .cursor/environment.json counts",
);
assert.ok(
  containerization.anyFiles.indexOf(".devcontainer") < containerization.anyFiles.indexOf("docker-compose.yml"),
  "product boot files must precede compose so first-hit names the boot env",
);
assert.ok(
  containerization.anyFiles.indexOf(".devcontainer/devcontainer.json") <
    containerization.anyFiles.indexOf("docker-compose.yml"),
);
assert.ok(
  containerization.anyFiles.indexOf(".cursor/environment.json") <
    containerization.anyFiles.indexOf("docker-compose.yml"),
);
assert.ok(
  containerization.anyFiles.indexOf(".devcontainer") < containerization.anyFiles.indexOf("Dockerfile"),
);
assert.match(containerization.fail, /Dockerfile/);
assert.match(containerization.fail, /\.cursor\/environment\.json/);

const deadCode = catalog.criteria.find((row) => row.id === "dead-code-detection");
assert.ok(deadCode.anyFiles.includes(".vulture"));
assert.ok(deadCode.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("vulture")));
assert.ok(deadCode.fileContains.some((rule) => rule.file === "Cargo.toml" && rule.includes.includes("cargo-machete")));
assert.match(deadCode.ciGrep, /deadcode/);
assert.match(deadCode.ciGrep, /cargo-machete/);

const bundleAnalysis = catalog.criteria.find((row) => row.id === "bundle-analysis");
assert.ok(bundleAnalysis.fileContains.some((rule) => (rule.includes ?? []).includes("source-map-explorer")));

const securityPolicy = catalog.criteria.find((row) => row.id === "security-policy");
assert.ok(securityPolicy.anyFiles.includes("docs/SECURITY.md"));
assert.ok(securityPolicy.anyFiles.includes("SECURITY.md"));
assert.ok(securityPolicy.anyFiles.includes("security.md"));

const e2eTests = catalog.criteria.find((row) => row.id === "e2e-tests");
assert.ok(e2eTests.anyFiles.includes("**/e2e/**"));
assert.ok(e2eTests.anyFiles.includes("**/cypress/**"));
assert.ok(e2eTests.anyFiles.includes("tests/e2e/**"));
assert.ok(e2eTests.anyFiles.includes("**/playwright.config.*"));
assert.ok(e2eTests.anyFiles.includes("integration"));

const depUpdate = catalog.criteria.find((row) => row.id === "dep-update-automation");
assert.ok(depUpdate.anyFiles.includes("renovate.json5"));
assert.ok(depUpdate.anyFiles.includes(".github/renovate.json"));
assert.ok(depUpdate.anyFiles.includes("renovate.json"));

const securityScanning = catalog.criteria.find((row) => row.id === "security-scanning");
assert.ok(securityScanning.anyFiles.includes("semgrep.yml"));
assert.ok(securityScanning.anyFiles.includes(".semgrep.yml"));
assert.ok(securityScanning.anyFiles.includes("bandit.yaml"));
assert.ok(securityScanning.anyFiles.includes(".bandit"));
assert.match(securityScanning.ciGrep, /gosec/);
assert.match(securityScanning.ciGrep, /govulncheck/);

const secretsDetection = catalog.criteria.find((row) => row.id === "secrets-detection");
assert.ok(secretsDetection.anyFiles.includes(".gitleaks.toml"));
assert.ok(secretsDetection.anyFiles.includes(".gitleaks.yml"));
assert.ok(secretsDetection.anyFiles.includes(".detect-secrets.cfg"));
assert.ok(secretsDetection.anyFiles.includes(".gitguardian.yml"));

const ciRunsTests = catalog.criteria.find((row) => row.id === "ci-runs-tests");
assert.match(ciRunsTests.ciGrep, /hereby/);
assert.match(ciRunsTests.ciGrep, /pytest/);
assert.match(ciRunsTests.ciGrep, /jest/);
assert.match(ciRunsTests.ciGrep, /vitest/);
assert.match(ciRunsTests.ciGrep, /go\\s\+test/);
assert.match(ciRunsTests.ciGrep, /mvn\\s\+test/);
assert.equal(/microsoft|TypeScript/i.test(ciRunsTests.ciGrep), false);

const ciRunsLinters = catalog.criteria.find((row) => row.id === "ci-runs-linters");
assert.match(ciRunsLinters.ciGrep, /golangci-lint/);
assert.match(ciRunsLinters.ciGrep, /biome\\s\+check/);
assert.match(ciRunsLinters.ciGrep, /eslint/);
assert.equal(/prettier|gofmt|rustfmt|clang-format|black|dprint/i.test(ciRunsLinters.ciGrep), false);

for (const glob of [
  "azure-pipelines.yml",
  ".azure-pipelines/**",
  "bitbucket-pipelines.yml",
  ".buildkite/pipeline.yml",
  ".buildkite/*.yml",
  ".woodpecker.yml",
  ".woodpecker/*.yml",
  ".drone.yml",
  "cloudbuild.yaml",
  "appveyor.yml",
]) {
  assert.ok(CI_GLOBS.includes(glob), `CI_GLOBS missing ${glob}`);
}
for (const glob of [
  "**/*_test.py",
  "**/tests/**/*.rs",
  "**/*_test.rs",
  "**/*_test.c",
  "**/*_test.cpp",
  "test/**/*.c",
  "**/*Spec.hs",
  "**/*Test.hs",
  "test/*.hs",
  "**/tests/**/*.tcl",
  "tests/*.test",
  "test/**/*.js",
  "**/*_test.exs",
  "**/*_spec.exs",
  "**/*Spec.scala",
  "**/*Test.scala",
  "**/*Tests.scala",
  "**/*Suite.scala",
  "src/test/**/*.scala",
  "**/*.tests.cpp",
  "test/**/*.cpp",
  "**/tests/**/*.cpp",
  "spec/**/*_spec.rb",
  "**/*_spec.rb",
  "**/test/**/*_test.rb",
  "test/test_*.rb",
  "**/test/test_*.rb",
  "**/*_test.cc",
  "**/*_test.cxx",
  "test/**/*.cc",
  "test/**/*.cxx",
  "**/tests/**/*.cc",
  "**/tests/**/*.cxx",
]) {
  assert.ok(TEST_FILE_GLOBS.includes(glob), `TEST_FILE_GLOBS missing ${glob}`);
}

assert.equal(globMatch("scripts/foo.test.mjs", "**/*.test.*"), true);
assert.equal(globMatch(".github/workflows/ci.yml", ".github/workflows/*.yml"), true);
assert.equal(globMatch("src/foo.js", "**/*.test.*"), false);
assert.equal(globMatch("docs/en/docs/contributing.md", "docs/**/contributing*"), true);
assert.equal(globMatch("docs/en/docs/CONTRIBUTING.md", "**/CONTRIBUTING.md"), true);
assert.equal(globMatch(".github/CONTRIBUTING.md", "**/CONTRIBUTING.md"), true);
assert.equal(globMatch("tests/conftest.py", "**/conftest.py"), true);
assert.equal(globMatch("LICENSE-MIT", "LICENSE-*"), true);
assert.equal(globMatch(".dprint.jsonc", ".prettierrc.*"), false);
assert.equal(globMatch(".dprint.json", ".prettierrc.*"), false);
assert.equal(globMatch("dprint.json", ".prettierrc.*"), false);
assert.equal(globMatch(".prettierrc.json", ".prettierrc.*"), true);
assert.equal(globMatch("pkg/foo_test.py", "**/*_test.py"), true);
assert.equal(globMatch("test_foo.py", "**/test_*.py"), true);
assert.equal(globToRegExp("**/test_*.py").test("tests/test_client.py"), true);
assert.equal(globToRegExp("**/test_*.py").test("add_latest_release_date.py"), false);
assert.equal(globMatch("tests/test_client.py", "**/test_*.py"), true);
assert.equal(globMatch("test_client.py", "**/test_*.py"), true);
assert.equal(globMatch("add_latest_release_date.py", "**/test_*.py"), false);
assert.equal(globMatch("parse_test_outputs.py", "**/test_*.py"), false);
assert.equal(globMatch("check_test_missing.py", "**/test_*.py"), false);
assert.equal(globMatch("utils/parse_test_outputs.py", "**/test_*.py"), false);
assert.equal(globMatch("foo.test.js", "**/*.test.js"), true);
assert.equal(globMatch("src/foo.test.js", "**/*.test.js"), true);
assert.equal(globMatch("src/lib_test.rs", "**/*_test.rs"), true);
assert.equal(globMatch("tests/foo.rs", "tests/**/*.rs"), true);
assert.equal(globMatch("tests/foo.rs", "**/tests/**/*.rs"), true);
assert.equal(globMatch("pkg/tests/foo.rs", "**/tests/**/*.rs"), true);
assert.equal(globMatch("tokio/tests/foo.rs", "**/tests/**/*.rs"), true);
assert.equal(globMatch("pkg/tests/foo.rs", "tests/**/*.rs"), false);
assert.equal(globMatch("test/router.js", "test/**/*.js"), true);
assert.equal(globMatch("FooSpec.hs", "**/*Spec.hs"), true);
assert.equal(globMatch("FooTest.hs", "**/*Test.hs"), true);
assert.equal(globMatch("test/phoenix/endpoint_test.exs", "**/*_test.exs"), true);
assert.equal(globMatch("test/ecto/schema_spec.exs", "**/*_spec.exs"), true);
assert.equal(globMatch("lib/phoenix/endpoint.ex", "**/*_test.exs"), false);
assert.equal(globMatch("core/src/test/scala/cats/FunctorSpec.scala", "**/*Spec.scala"), true);
assert.equal(globMatch("core/src/test/scala/cats/FunctorTest.scala", "**/*Test.scala"), true);
assert.equal(globMatch("tests/shared/src/test/scala/cats/tests/FoldableSuite.scala", "**/*Suite.scala"), true);
assert.equal(globMatch("src/test/scala/foo/Bar.scala", "src/test/**/*.scala"), true);
assert.equal(globMatch("src/main/scala/foo/Bar.scala", "src/test/**/*.scala"), false);
assert.equal(globMatch("tests/SelfTest/UsageTests/Approx.tests.cpp", "**/*.tests.cpp"), true);
assert.equal(globMatch("tests/src/unit-algorithms.cpp", "**/tests/**/*.cpp"), true);
assert.equal(globMatch("test/format.cpp", "test/**/*.cpp"), true);
assert.equal(globMatch("src/foo.cpp", "**/*.tests.cpp"), false);
assert.equal(globMatch("src/foo.cpp", "test/**/*.cpp"), false);
assert.equal(globMatch("src/foo.cpp", "**/tests/**/*.cpp"), false);
assert.equal(globMatch("spec/models/user_spec.rb", "spec/**/*_spec.rb"), true);
assert.equal(globMatch("spec/models/user_spec.rb", "**/*_spec.rb"), true);
assert.equal(globMatch("test/foo_spec.rb", "**/*_spec.rb"), true);
assert.equal(globMatch("test/models/user_test.rb", "**/test/**/*_test.rb"), true);
assert.equal(globMatch("activerecord/test/cases/base_test.rb", "**/test/**/*_test.rb"), true);
assert.equal(globMatch("lib/user.rb", "**/test/**/*_test.rb"), false);
assert.equal(globMatch("testdata/user_test.rb", "**/test/**/*_test.rb"), false);
assert.equal(globMatch("test/test_site.rb", "test/test_*.rb"), true);
assert.equal(globMatch("test/test_site.rb", "**/test/test_*.rb"), true);
assert.equal(globMatch("pkg/test/test_site.rb", "**/test/test_*.rb"), true);
assert.equal(globMatch("pkg/test/test_site.rb", "test/test_*.rb"), false);
assert.equal(globMatch("testdata/test_site.rb", "test/test_*.rb"), false);
assert.equal(globMatch("testdata/test_site.rb", "**/test/test_*.rb"), false);
assert.equal(globMatch("lib/test_site.rb", "test/test_*.rb"), false);
assert.equal(globMatch("lib/test_site.rb", "**/test/test_*.rb"), false);
assert.equal(globMatch("test/format-test.cc", "test/**/*.cc"), true);
assert.equal(globMatch("absl/strings/str_cat_test.cc", "**/*_test.cc"), true);
assert.equal(globMatch("tests/unit-conversions.cc", "**/tests/**/*.cc"), true);
assert.equal(globMatch("test/itkImageTest.cxx", "test/**/*.cxx"), true);
assert.equal(globMatch("tests/mesh_test.cxx", "**/*_test.cxx"), true);
assert.equal(globMatch("src/format.cc", "test/**/*.cc"), false);
assert.equal(globMatch("src/format.cc", "**/*_test.cc"), false);
assert.equal(globMatch("src/format.cc", "**/tests/**/*.cc"), false);
assert.equal(globMatch("src/format.cxx", "test/**/*.cxx"), false);
assert.equal(globMatch("test/main.c", "test/**/*.c"), true);
assert.equal(globMatch("azure-pipelines.yml", "azure-pipelines.yml"), true);
assert.equal(globMatch(".buildkite/pipeline.yml", ".buildkite/*.yml"), true);
assert.equal(globMatch(".azure-pipelines/ci.yml", ".azure-pipelines/**"), true);
assert.equal(globMatch(".github/instructions/node.md", ".github/instructions/**/*.md"), true);
assert.equal(globMatch("api/openapi.yaml", "**/openapi.yaml"), true);
assert.equal(globMatch("LICENSES/MIT.txt", "LICENSES/**"), true);
assert.equal(globMatch(".lintstagedrc.json", ".lintstagedrc.*"), true);

assert.deepEqual(findMatches(["a/b.txt"], ["**/*.txt", "a/*.txt"]), ["a/b.txt"]);
assert.deepEqual(findMatches(["a.txt", "b.txt"], ["*.txt", "b.txt"]), ["a.txt", "b.txt"]);
assert.deepEqual(findMatches(["a.txt"], ["*.md"]), []);
assert.deepEqual(testFiles(["src/test/scala/foo/BarSpec.scala"]), ["src/test/scala/foo/BarSpec.scala"]);
assert.deepEqual(testFiles(["test/router.test.js"]), ["test/router.test.js"]);
assert.deepEqual(testFiles(["tests/mesh_test.cxx"]), ["tests/mesh_test.cxx"]);
assert.deepEqual(testFiles(["tsconfig.spec.json"]), []);
assert.deepEqual(testFiles(["tsconfig.test.json"]), []);
assert.deepEqual(testFiles(["jsconfig.spec.json"]), []);
assert.deepEqual(testFiles(["packages/docs/tsconfig.test.json"]), []);
assert.deepEqual(
  testFiles(["tsconfig.spec.json", "src/app.controller.spec.ts"]),
  ["src/app.controller.spec.ts"],
);
assert.deepEqual(testFiles(["foo.test.js"]), ["foo.test.js"]);
assert.deepEqual(testFiles(["bar.spec.ts"]), ["bar.spec.ts"]);
assert.deepEqual(ciFiles([".buildkite/pipeline.yml"]), [".buildkite/pipeline.yml"]);
assert.deepEqual(
  ciFiles([".buildkite/pipeline.yml", ".github/workflows/ci.yml"]),
  [".github/workflows/ci.yml", ".buildkite/pipeline.yml"],
  "dedupe keeps the first match per path so the reported CI config is stable",
);

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

const l1FourOfFour = catalogRows({
  l1Pass: () => true,
  l2Pass: () => true,
});
const scoredL1 = scoreResults(catalog, l1FourOfFour);
assert.equal(scoredL1.level, 2, "L1 4/4 plus complete L2 should reach Documented");
assert.equal(scoredL1.l1Passed, 4);
assert.equal(scoredL1.l1Total, 4);
assert.equal(scoredL1.l2Passed, 13);
assert.equal(scoredL1.l2Total, 13);
assert.equal(scoredL1.nextLevelProgress.needed, Math.ceil(10 * LEVEL_THRESHOLD));

const l1ThreeOfFour = catalogRows({
  l1Pass: (criterion) => criterion.id !== "linter",
  l2Pass: () => true,
});
const scoredThreeOfFour = scoreResults(catalog, l1ThreeOfFour);
assert.equal(scoredThreeOfFour.level, 1, "L1 3/4 stays Functional at 80%");
assert.equal(scoredThreeOfFour.l1Passed, 3);
assert.equal(scoredThreeOfFour.l1Total, 4);
assert.equal(scoredThreeOfFour.nextLevelProgress.needed, Math.ceil(13 * LEVEL_THRESHOLD));

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
assert.equal(byId.editorconfig.skipped, false, "both linter and .editorconfig still pass, not skip");
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

assert.equal(byId["type-checker"].skipped, true, byId["type-checker"].message);
assert.match(byId["type-checker"].message, /no conventional type-checker file/i);

const scored = scoreResults(evalJs.catalog, evalJs.results);
assert.equal(scored.level, 1);
assert.ok(scored.scorePercent > 0);
assert.equal(scored.l1Passed, 3);
assert.equal(scored.l1Total, 3);

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
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "# agents\n");
  fs.mkdirSync(path.join(dir, ".husky"));
}

const l1MissEditor = tmp("code-readiness-l1-");
writeGuidedMinusEditorconfig(l1MissEditor);
const l1MissEval = evaluateRepo(l1MissEditor);
const l1MissById = resultById(l1MissEval);
assert.equal(l1MissById.linter.pass, true, l1MissById.linter.message);
assert.equal(l1MissById.editorconfig.skipped, true, l1MissById.editorconfig.message);
assert.equal(l1MissById.editorconfig.pass, false);
assert.equal(l1MissById.editorconfig.level, 2);
assert.match(l1MissById.editorconfig.message, /prescriptive linter/i);
assert.equal(l1MissById.license.pass, true);
assert.equal(l1MissById.readme.pass, true);
assert.equal(l1MissById["lock-file"].pass, true);
assert.equal(l1MissById.formatter.pass, true, l1MissById.formatter.message);
assert.match(l1MissById.formatter.message, /\.prettierrc/);
const l1MissScored = scoreResults(l1MissEval.catalog, l1MissEval.results);
assert.equal(l1MissById["type-checker"].skipped, true, l1MissById["type-checker"].message);
assert.equal(l1MissScored.l1Passed, 3);
assert.equal(l1MissScored.l1Total, 3);
assert.ok(l1MissScored.l2Passed / l1MissScored.l2Total >= LEVEL_THRESHOLD);
assert.equal(l1MissScored.level, 2, "missing only .editorconfig still reaches Documented");
const l1MissRecs = recommend(l1MissEval.results, l1MissScored.level);
assert.equal(
  l1MissRecs.some((row) => row.criterionId === "editorconfig"),
  false,
  "skipped editorconfig must not lead the todo list",
);

function writeDocumentedMinus(dir, { linter = true, agents = true, ci = true, husky = true } = {}) {
  fs.writeFileSync(path.join(dir, "LICENSE"), "MIT\n");
  fs.writeFileSync(
    path.join(dir, "README.md"),
    `${"A".repeat(520)}\n# sample\nsetup and usage.\n`,
  );
  const devDependencies = { jest: "29.0.0", prettier: "3.0.0" };
  if (linter) devDependencies.eslint = "9.0.0";
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      scripts: { test: "node test.js", dev: "node ." },
      devDependencies,
    }),
  );
  fs.writeFileSync(path.join(dir, "package-lock.json"), "{}\n");
  if (linter) fs.writeFileSync(path.join(dir, "eslint.config.js"), "export default [];\n");
  fs.writeFileSync(path.join(dir, ".prettierrc"), "{}\n");
  fs.writeFileSync(path.join(dir, "app.test.js"), "test('ok', () => {});\n");
  fs.writeFileSync(path.join(dir, "CONTRIBUTING.md"), "# contributing\n");
  fs.writeFileSync(path.join(dir, ".env.example"), "FOO=\n");
  fs.writeFileSync(path.join(dir, ".nvmrc"), "20\n");
  if (ci) {
    fs.mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".github", "workflows", "ci.yml"), "name: ci\n");
  }
  if (agents) fs.writeFileSync(path.join(dir, "AGENTS.md"), "# agents\n");
  if (husky) fs.mkdirSync(path.join(dir, ".husky"));
}

function assertChatThreeLines(lines) {
  assert.equal(lines.length, 3, `chat must be exactly three lines, got ${lines.length}`);
  assert.match(lines[0], /^Level \d+ /);
  assert.match(lines[1], /^Top fix: /);
  assert.match(lines[2], /^Canvas: /);
}

const l1CapLintRoot = tmp("code-readiness-l1-cap-lint-");
writeDocumentedMinus(l1CapLintRoot, { linter: false });
const l1CapLintEval = evaluateRepo(l1CapLintRoot);
const l1CapLintById = resultById(l1CapLintEval);
const l1CapLintReport = buildReport(l1CapLintEval, {
  repoRoot: l1CapLintRoot,
  repoName: "l1-cap-lint",
});
assert.equal(l1CapLintById.linter.pass, false, l1CapLintById.linter.message);
assert.equal(l1CapLintById.editorconfig.pass, false);
assert.equal(l1CapLintById.editorconfig.skipped, false, "linter fail must not skip editorconfig");
assert.equal(l1CapLintReport.maturity_level.level, 1);
assert.ok(l1CapLintReport.maturity_level.l1CapReasons.includes("linter"));
assert.ok(l1CapLintReport.languages.includes("javascript"));
const l1CapLintRecs = recommend(l1CapLintEval.results, l1CapLintReport.maturity_level.level);
assert.equal(
  l1CapLintRecs[0]?.criterionId,
  "linter",
  "L1 fail must rank before editorconfig",
);
assert.notEqual(l1CapLintRecs[0]?.criterionId, "editorconfig");
const l1CapLintChat = chatLines(l1CapLintReport, "./code-readiness.canvas.tsx");
assertChatThreeLines(l1CapLintChat);
assert.match(l1CapLintChat[1], /linter/);
assert.match(l1CapLintChat[1], /eslint\.config\.js/);
assert.equal(
  /editorconfig/i.test(l1CapLintChat[1]),
  false,
  "L1 linter fail must not lead chat with editorconfig",
);

const l2GateAgentsRoot = tmp("code-readiness-l2-gate-agents-");
writeDocumentedMinus(l2GateAgentsRoot, { agents: false, ci: false, husky: false });
const l2GateAgentsEval = evaluateRepo(l2GateAgentsRoot);
const l2GateAgentsById = resultById(l2GateAgentsEval);
const l2GateAgentsReport = buildReport(l2GateAgentsEval, {
  repoRoot: l2GateAgentsRoot,
  repoName: "l2-gate-agents",
});
assert.equal(l2GateAgentsById.linter.pass, true, l2GateAgentsById.linter.message);
assert.equal(l2GateAgentsById.editorconfig.skipped, true);
assert.equal(l2GateAgentsById["ai-context"].pass, false);
assert.equal(l2GateAgentsReport.maturity_level.level, 1, "L2 gate still open");
assert.equal(l2GateAgentsReport.maturity_level.l1Capped, false);
const l2GateAgentsRecs = recommend(
  l2GateAgentsEval.results,
  l2GateAgentsReport.maturity_level.level,
);
assert.equal(
  l2GateAgentsRecs[0]?.criterionId,
  "ai-context",
  "L2-gated remaining fail must be ai-context, not a lower-priority id",
);
const l2GateAgentsChat = chatLines(l2GateAgentsReport, "./code-readiness.canvas.tsx");
assertChatThreeLines(l2GateAgentsChat);
assert.match(l2GateAgentsChat[1], /ai-context/);
assert.match(l2GateAgentsChat[1], /AGENTS\.md/);
assert.equal(/editorconfig/i.test(l2GateAgentsChat[1]), false);

assert.equal(
  chatFixFile(
    {
      languages: ["python"],
      criterion_results: [{ criterionId: "linter", message: "No linter configuration found." }],
    },
    { criterionId: "linter" },
  ),
  "ruff.toml",
);
assert.equal(
  chatFixFile(
    {
      languages: [],
      criterion_results: [{ criterionId: "linter", message: "Looked for .golangci.yml" }],
    },
    { criterionId: "linter" },
  ),
  ".golangci.yml",
  "no languages: take a language-neutral path from the fail message / first-hit",
);
assert.equal(
  chatFixFile(
    {
      languages: [],
      criterion_results: [{ criterionId: "linter", message: "No .editorconfig found." }],
    },
    { criterionId: "linter" },
  ),
  "eslint.config.js",
  "never dummy .editorconfig while linter is the gate",
);

const pyGuidedRoot = tmp("code-readiness-py-guided-");
fs.writeFileSync(
  path.join(pyGuidedRoot, "pyproject.toml"),
  [
    "[project]",
    'name = "x"',
    'version = "0.1.0"',
    'requires-python = ">=3.10"',
    "",
    "[tool.ruff]",
    "line-length = 88",
    "",
    "[tool.pytest.ini_options]",
    'testpaths = ["."]',
    "",
  ].join("\n"),
);
fs.writeFileSync(
  path.join(pyGuidedRoot, "README.md"),
  `${"A".repeat(520)}\n# sample\nsetup and usage.\n`,
);
fs.writeFileSync(path.join(pyGuidedRoot, "LICENSE"), "MIT\n");
fs.writeFileSync(path.join(pyGuidedRoot, "test_sample.py"), "def test_ok():\n    assert True\n");
fs.writeFileSync(path.join(pyGuidedRoot, "CONTRIBUTING.md"), "# contributing\n");
fs.writeFileSync(path.join(pyGuidedRoot, "Makefile"), "setup:\n\t@echo setup\ntest:\n\tpytest\n");
const pyGuidedEval = evaluateRepo(pyGuidedRoot);
const pyGuidedById = resultById(pyGuidedEval);
assert.equal(pyGuidedById["lock-file"].skipped, true, pyGuidedById["lock-file"].message);
assert.equal(pyGuidedById.editorconfig.skipped, true, pyGuidedById.editorconfig.message);
assert.equal(pyGuidedById.editorconfig.pass, false);
assert.equal(pyGuidedById.editorconfig.level, 2);
assert.equal(pyGuidedById.readme.pass, true);
assert.equal(pyGuidedById.license.pass, true);
assert.equal(pyGuidedById["env-documentation"].skipped, true);
assert.equal(pyGuidedById["type-checker"].skipped, true, pyGuidedById["type-checker"].message);
assert.equal(pyGuidedById.linter.pass, true);
assert.equal(pyGuidedById["test-files-exist"].pass, true);
assert.equal(pyGuidedById["test-script"].pass, true, pyGuidedById["test-script"].message);
const pyGuidedScored = scoreResults(pyGuidedEval.catalog, pyGuidedEval.results);
assert.equal(pyGuidedScored.l1Passed, 3);
assert.equal(pyGuidedScored.l1Total, 3);
assert.equal(pyGuidedById.license.level, 2);
assert.equal(pyGuidedById["lock-file"].level, 2);

const goRoot = tmp("code-readiness-go-");
fs.writeFileSync(path.join(goRoot, "go.mod"), "module example.com/x\n\ngo 1.22\n");
const goEval = evaluateRepo(goRoot);
const goById = resultById(goEval);
assert.equal(goById.formatter.pass, true, goById.formatter.message);
assert.match(goById.formatter.message, /Go has built-in formatting via gofmt/);
assert.equal(goById.linter.pass, false, "gofmt is not a linter");
assert.equal(goById.editorconfig.skipped, false, "formatter must not skip editorconfig");
assert.equal(goById.editorconfig.pass, false);
assert.equal(goById["type-checker"].pass, true, goById["type-checker"].message);
assert.equal(goById["version-pinned"].pass, true);

const rustRoot = tmp("code-readiness-rs-");
fs.writeFileSync(path.join(rustRoot, "Cargo.toml"), "[package]\nname = \"x\"\nversion = \"0.1.0\"\n");
const rustEval = evaluateRepo(rustRoot);
const rustById = resultById(rustEval);
assert.equal(rustById.formatter.pass, true, rustById.formatter.message);
assert.equal(rustById.linter.pass, false, "rustfmt is not a linter");
assert.equal(rustById.editorconfig.skipped, false, "formatter must not skip editorconfig");
assert.equal(rustById.editorconfig.pass, false);
assert.equal(rustById["type-checker"].pass, true, rustById["type-checker"].message);
assert.equal(
  rustById["test-framework"].pass,
  false,
  "Cargo.toml alone is not test-framework; need tests/, [[test]], or *_test.rs",
);
assert.equal(rustById["setup-script"].pass, true, "Cargo.toml is a setup script");
assert.equal(rustById.linter.pass, false, "Cargo.toml alone is not a linter; no languagesPass rust on linter");
assert.equal(rustById["lock-file"].skipped, true, rustById["lock-file"].message);
assert.match(rustById["lock-file"].message, /no conventional committed lockfile/i);

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

const pyNoLockRoot = tmp("code-readiness-py-nolock-");
fs.writeFileSync(
  path.join(pyNoLockRoot, "pyproject.toml"),
  "[project]\nname = \"x\"\nversion = \"0.1.0\"\n",
);
const pyNoLockEval = evaluateRepo(pyNoLockRoot);
const pyNoLockById = resultById(pyNoLockEval);
assert.equal(pyNoLockById["lock-file"].skipped, true, pyNoLockById["lock-file"].message);
assert.match(pyNoLockById["lock-file"].message, /no conventional committed lockfile/i);
assert.equal(pyNoLockById["lock-file"].pass, false);
assert.equal(/pyproject\.toml/i.test(pyNoLockById["lock-file"].message), false);
assert.equal(pyNoLockById["test-script"].pass, false, pyNoLockById["test-script"].message);
assert.equal(pyNoLockById["setup-script"].pass, false, pyNoLockById["setup-script"].message);
assert.equal(pyNoLockById["type-checker"].skipped, true, pyNoLockById["type-checker"].message);

const pyJsLockRoot = tmp("code-readiness-pyjs-lock-");
fs.writeFileSync(
  path.join(pyJsLockRoot, "pyproject.toml"),
  "[project]\nname = \"x\"\nversion = \"0.1.0\"\n",
);
fs.writeFileSync(path.join(pyJsLockRoot, "package.json"), "{}\n");
fs.writeFileSync(path.join(pyJsLockRoot, "package-lock.json"), "{}\n");
const pyJsLockById = resultById(evaluateRepo(pyJsLockRoot));
assert.equal(pyJsLockById["lock-file"].pass, true, pyJsLockById["lock-file"].message);
assert.equal(pyJsLockById["lock-file"].skipped, false);
assert.match(pyJsLockById["lock-file"].message, /package-lock\.json/);

const jsNoLockRoot = tmp("code-readiness-js-nolock-");
fs.writeFileSync(path.join(jsNoLockRoot, "package.json"), "{}\n");
const jsNoLockById = resultById(evaluateRepo(jsNoLockRoot));
assert.equal(jsNoLockById["lock-file"].skipped, true, jsNoLockById["lock-file"].message);
assert.match(jsNoLockById["lock-file"].message, /no conventional committed lockfile/i);
assert.equal(jsNoLockById["lock-file"].pass, false);
assert.equal(jsNoLockById["type-checker"].skipped, true, jsNoLockById["type-checker"].message);
assert.equal(jsNoLockById.formatter.pass, false, jsNoLockById.formatter.message);
assert.match(jsNoLockById.formatter.message, /No formatter configuration found/);

const tsNoLockRoot = tmp("code-readiness-ts-nolock-");
fs.writeFileSync(path.join(tsNoLockRoot, "tsconfig.json"), "{}\n");
const tsNoLockById = resultById(evaluateRepo(tsNoLockRoot));
assert.equal(tsNoLockById["lock-file"].skipped, true, tsNoLockById["lock-file"].message);
assert.match(tsNoLockById["lock-file"].message, /no conventional committed lockfile/i);
assert.equal(tsNoLockById["lock-file"].pass, false);
assert.equal(tsNoLockById["type-checker"].skipped, false);
assert.equal(tsNoLockById["type-checker"].pass, true, tsNoLockById["type-checker"].message);
assert.match(tsNoLockById["type-checker"].message, /tsconfig\.json/);

const jsLockPassRoot = tmp("code-readiness-js-lock-");
fs.writeFileSync(path.join(jsLockPassRoot, "package.json"), "{}\n");
fs.writeFileSync(path.join(jsLockPassRoot, "yarn.lock"), "# yarn\n");
const jsLockPassById = resultById(evaluateRepo(jsLockPassRoot));
assert.equal(jsLockPassById["lock-file"].pass, true, jsLockPassById["lock-file"].message);
assert.equal(jsLockPassById["lock-file"].skipped, false);
assert.match(jsLockPassById["lock-file"].message, /yarn\.lock/);

const setupTestRoot = tmp("code-readiness-setup-test-");
fs.writeFileSync(
  path.join(setupTestRoot, "package.json"),
  JSON.stringify({ scripts: { test: "jest" } }),
);
const setupTestById = resultById(evaluateRepo(setupTestRoot));
assert.equal(setupTestById["setup-script"].pass, true, setupTestById["setup-script"].message);
assert.match(setupTestById["setup-script"].message, /scripts\.test/);
assert.equal(/scripts\.dev/.test(setupTestById["setup-script"].message), false);
assert.equal(setupTestById["test-script"].pass, true, setupTestById["test-script"].message);

const pyNativeRoot = tmp("code-readiness-py-native-");
fs.writeFileSync(
  path.join(pyNativeRoot, "pyproject.toml"),
  "[build-system]\nrequires = [\"setuptools\"]\n[tool.pytest.ini_options]\n",
);
const pyNativeById = resultById(evaluateRepo(pyNativeRoot));
assert.equal(pyNativeById["test-script"].pass, true, pyNativeById["test-script"].message);
assert.equal(pyNativeById["setup-script"].pass, true, pyNativeById["setup-script"].message);
assert.match(pyNativeById["test-script"].message, /\[tool\.pytest/);
assert.match(pyNativeById["setup-script"].message, /\[build-system\]/);

const testShRoot = tmp("code-readiness-test-sh-");
fs.mkdirSync(path.join(testShRoot, "scripts"));
fs.writeFileSync(path.join(testShRoot, "scripts", "test.sh"), "pytest\n");
const testShById = resultById(evaluateRepo(testShRoot));
assert.equal(testShById["test-script"].pass, true, testShById["test-script"].message);
assert.match(testShById["test-script"].message, /scripts\/test\.sh/);

const envSkipRoot = tmp("code-readiness-env-skip-");
fs.writeFileSync(path.join(envSkipRoot, "index.js"), "export default {}\n");
const envSkipEval = evaluateRepo(envSkipRoot);
const envSkipById = resultById(envSkipEval);
assert.equal(envSkipById["env-documentation"].skipped, true, envSkipById["env-documentation"].message);
assert.equal(envSkipById["env-documentation"].pass, false);

const envSampleComposeRoot = tmp("code-readiness-env-sample-compose-");
fs.mkdirSync(path.join(envSampleComposeRoot, "sample", "app"), { recursive: true });
fs.writeFileSync(
  path.join(envSampleComposeRoot, "sample", "app", "docker-compose.yml"),
  "services: {}\n",
);
const envSampleComposeById = resultById(evaluateRepo(envSampleComposeRoot));
assert.equal(
  envSampleComposeById["env-documentation"].skipped,
  true,
  envSampleComposeById["env-documentation"].message,
);

const envIntegrationComposeRoot = tmp("code-readiness-env-integration-compose-");
fs.mkdirSync(path.join(envIntegrationComposeRoot, "integration"), { recursive: true });
fs.writeFileSync(
  path.join(envIntegrationComposeRoot, "integration", "docker-compose.yml"),
  "services: {}\n",
);
const envIntegrationComposeById = resultById(evaluateRepo(envIntegrationComposeRoot));
assert.equal(
  envIntegrationComposeById["env-documentation"].skipped,
  true,
  envIntegrationComposeById["env-documentation"].message,
);

const envRootDotenvFail = tmp("code-readiness-env-root-dotenv-");
fs.writeFileSync(path.join(envRootDotenvFail, ".env"), "FOO=1\n");
const envRootDotenvById = resultById(evaluateRepo(envRootDotenvFail));
assert.equal(envRootDotenvById["env-documentation"].skipped, false);
assert.equal(
  envRootDotenvById["env-documentation"].pass,
  false,
  envRootDotenvById["env-documentation"].message,
);

const envFailRoot = tmp("code-readiness-env-fail-");
fs.writeFileSync(path.join(envFailRoot, "docker-compose.yml"), "services: {}\n");
const envFailEval = evaluateRepo(envFailRoot);
const envFailById = resultById(envFailEval);
assert.equal(envFailById["env-documentation"].skipped, false);
assert.equal(envFailById["env-documentation"].pass, false, envFailById["env-documentation"].message);

const envExamplePassRoot = tmp("code-readiness-env-example-");
fs.writeFileSync(path.join(envExamplePassRoot, ".env.example"), "FOO=\n");
const envExamplePassById = resultById(evaluateRepo(envExamplePassRoot));
assert.equal(envExamplePassById["env-documentation"].skipped, false);
assert.equal(
  envExamplePassById["env-documentation"].pass,
  true,
  envExamplePassById["env-documentation"].message,
);

const nestedRoot = tmp("code-readiness-contrib-");
fs.mkdirSync(path.join(nestedRoot, "docs", "en", "docs"), { recursive: true });
fs.writeFileSync(path.join(nestedRoot, "docs", "en", "docs", "contributing.md"), "# contributing\n");
const nestedEval = evaluateRepo(nestedRoot);
const nestedById = resultById(nestedEval);
assert.equal(nestedById.contributing.pass, true, nestedById.contributing.message);
assert.match(nestedById.contributing.message, /docs\/en\/docs\/contributing\.md/);

const ruffRoot = tmp("code-readiness-ruff-");
fs.writeFileSync(path.join(ruffRoot, "pyproject.toml"), "[tool.ruff]\nline-length = 88\n");
const ruffById = resultById(evaluateRepo(ruffRoot));
assert.equal(ruffById.linter.pass, true, ruffById.linter.message);
assert.match(ruffById.linter.message, /pyproject\.toml/);
assert.equal(ruffById.editorconfig.skipped, true, ruffById.editorconfig.message);

const eslintNoEditorRoot = tmp("code-readiness-eslint-no-editor-");
fs.writeFileSync(path.join(eslintNoEditorRoot, "eslint.config.js"), "export default [];\n");
const eslintNoEditorById = resultById(evaluateRepo(eslintNoEditorRoot));
assert.equal(eslintNoEditorById.linter.pass, true, eslintNoEditorById.linter.message);
assert.equal(eslintNoEditorById.editorconfig.skipped, true, eslintNoEditorById.editorconfig.message);
assert.equal(eslintNoEditorById.editorconfig.pass, false);
assert.match(eslintNoEditorById.editorconfig.message, /prescriptive linter/i);

const neitherStyleRoot = tmp("code-readiness-neither-style-");
fs.writeFileSync(path.join(neitherStyleRoot, "index.js"), "export default {}\n");
const neitherStyleById = resultById(evaluateRepo(neitherStyleRoot));
assert.equal(neitherStyleById.linter.pass, false);
assert.equal(neitherStyleById.linter.skipped, false);
assert.equal(neitherStyleById.editorconfig.pass, false);
assert.equal(neitherStyleById.editorconfig.skipped, false);
assert.match(neitherStyleById.editorconfig.message, /No \.editorconfig found/);

const editorOnlyRoot = tmp("code-readiness-editor-only-");
fs.writeFileSync(path.join(editorOnlyRoot, ".editorconfig"), "root = true\n");
const editorOnlyById = resultById(evaluateRepo(editorOnlyRoot));
assert.equal(editorOnlyById.editorconfig.pass, true, editorOnlyById.editorconfig.message);
assert.equal(editorOnlyById.editorconfig.skipped, false);
assert.equal(editorOnlyById.linter.pass, false);

const flake8Root = tmp("code-readiness-flake8-");
fs.writeFileSync(path.join(flake8Root, ".flake8"), "[flake8]\nmax-line-length = 88\n");
const flake8ById = resultById(evaluateRepo(flake8Root));
assert.equal(flake8ById.linter.pass, true, flake8ById.linter.message);
assert.match(flake8ById.linter.message, /\.flake8/);
assert.equal(flake8ById.editorconfig.skipped, true, flake8ById.editorconfig.message);
assert.equal(flake8ById.editorconfig.pass, false);

const clippyRoot = tmp("code-readiness-clippy-");
fs.writeFileSync(path.join(clippyRoot, "clippy.toml"), "too-many-arguments-threshold = 8\n");
const clippyById = resultById(evaluateRepo(clippyRoot));
assert.equal(clippyById.linter.pass, true, clippyById.linter.message);
assert.match(clippyById.linter.message, /clippy\.toml/);
assert.equal(clippyById.editorconfig.skipped, true, clippyById.editorconfig.message);
assert.equal(clippyById.editorconfig.pass, false);

const clangTidyRoot = tmp("code-readiness-clang-tidy-");
fs.writeFileSync(path.join(clangTidyRoot, ".clang-tidy"), "Checks: '-*'\n");
const clangTidyById = resultById(evaluateRepo(clangTidyRoot));
assert.equal(clangTidyById.linter.pass, true, clangTidyById.linter.message);
assert.match(clangTidyById.linter.message, /\.clang-tidy/);
assert.equal(clangTidyById.editorconfig.skipped, true, clangTidyById.editorconfig.message);
assert.equal(clangTidyById.editorconfig.pass, false);

const mypyRoot = tmp("code-readiness-mypy-");
fs.writeFileSync(path.join(mypyRoot, "pyproject.toml"), "[tool.mypy]\nstrict = true\n");
const mypyById = resultById(evaluateRepo(mypyRoot));
assert.equal(mypyById["type-checker"].pass, true, mypyById["type-checker"].message);
assert.match(mypyById["type-checker"].message, /pyproject\.toml/);
assert.match(mypyById["type-checker"].message, /\[tool\.mypy\]/);

const pyrightRoot = tmp("code-readiness-pyright-");
fs.writeFileSync(path.join(pyrightRoot, "pyproject.toml"), "[tool.pyright]\ntypeCheckingMode = \"strict\"\n");
const pyrightById = resultById(evaluateRepo(pyrightRoot));
assert.equal(pyrightById["type-checker"].pass, true, pyrightById["type-checker"].message);
assert.match(pyrightById["type-checker"].message, /\[tool\.pyright\]/);

const tyRoot = tmp("code-readiness-ty-");
fs.writeFileSync(path.join(tyRoot, "pyproject.toml"), "[tool.ty]\n");
const tyById = resultById(evaluateRepo(tyRoot));
assert.equal(tyById["type-checker"].pass, true, tyById["type-checker"].message);
assert.equal(tyById["type-checker"].skipped, false);
assert.match(tyById["type-checker"].message, /\[tool\.ty\]/);

const basedPyrightRoot = tmp("code-readiness-basedpyright-");
fs.writeFileSync(path.join(basedPyrightRoot, "pyproject.toml"), "[tool.basedpyright]\n");
const basedPyrightById = resultById(evaluateRepo(basedPyrightRoot));
assert.equal(basedPyrightById["type-checker"].pass, true, basedPyrightById["type-checker"].message);
assert.equal(basedPyrightById["type-checker"].skipped, false);
assert.match(basedPyrightById["type-checker"].message, /\[tool\.basedpyright\]/);

const ruffOnlyRoot = tmp("code-readiness-ruff-only-");
fs.writeFileSync(path.join(ruffOnlyRoot, "pyproject.toml"), "[tool.ruff]\nline-length = 88\n");
const ruffOnlyById = resultById(evaluateRepo(ruffOnlyRoot));
assert.equal(ruffOnlyById["type-checker"].skipped, true, ruffOnlyById["type-checker"].message);
assert.match(ruffOnlyById["type-checker"].message, /no conventional type-checker file/i);
assert.equal(ruffOnlyById.linter.pass, true, ruffOnlyById.linter.message);

const emptyPyprojectRoot = tmp("code-readiness-empty-pyproject-");
fs.writeFileSync(path.join(emptyPyprojectRoot, "pyproject.toml"), "");
const emptyPyprojectById = resultById(evaluateRepo(emptyPyprojectRoot));
assert.equal(emptyPyprojectById["type-checker"].skipped, true, emptyPyprojectById["type-checker"].message);
assert.match(emptyPyprojectById["type-checker"].message, /no conventional type-checker file/i);

const looseTsRoot = tmp("code-readiness-ts-loose-");
fs.writeFileSync(
  path.join(looseTsRoot, "tsconfig.json"),
  JSON.stringify({ compilerOptions: { target: "ES2020" } }),
);
const looseTsById = resultById(evaluateRepo(looseTsRoot));
assert.equal(looseTsById["type-checker"].pass, true, looseTsById["type-checker"].message);
assert.equal(looseTsById["type-checker"].skipped, false);
assert.match(looseTsById["type-checker"].message, /tsconfig\.json/);
assert.equal(/Go has a built-in static type system/.test(looseTsById["type-checker"].message), false);

const nestTsRoot = tmp("code-readiness-ts-nest-");
fs.writeFileSync(
  path.join(nestTsRoot, "tsconfig.json"),
  JSON.stringify({ compilerOptions: { strictNullChecks: true } }),
);
const nestTsById = resultById(evaluateRepo(nestTsRoot));
assert.equal(nestTsById["type-checker"].pass, true, nestTsById["type-checker"].message);
assert.equal(nestTsById["type-checker"].skipped, false);
assert.match(nestTsById["type-checker"].message, /tsconfig\.json/);
assert.equal(/Go has a built-in static type system/.test(nestTsById["type-checker"].message), false);

const strayGoRoot = tmp("code-readiness-stray-go-");
fs.writeFileSync(path.join(strayGoRoot, "package.json"), "{}\n");
fs.mkdirSync(path.join(strayGoRoot, "tools"));
fs.writeFileSync(path.join(strayGoRoot, "tools", "foo.go"), "package tools\n");
const strayGoById = resultById(evaluateRepo(strayGoRoot));
assert.equal(strayGoById["type-checker"].skipped, true, strayGoById["type-checker"].message);
assert.match(strayGoById["type-checker"].message, /no conventional type-checker file/i);
assert.equal(/Go has a built-in static type system/.test(strayGoById["type-checker"].message), false);
assert.equal(strayGoById.formatter.pass, false, strayGoById.formatter.message);

const dprintRoot = tmp("code-readiness-dprint-");
fs.writeFileSync(path.join(dprintRoot, "package.json"), "{}\n");
fs.writeFileSync(path.join(dprintRoot, ".dprint.jsonc"), "{ \"plugins\": [] }\n");
const dprintById = resultById(evaluateRepo(dprintRoot));
assert.equal(dprintById.formatter.pass, true, dprintById.formatter.message);
assert.match(dprintById.formatter.message, /\.dprint\.jsonc/);
assert.equal(/Go has built-in formatting via gofmt/.test(dprintById.formatter.message), false);
assert.equal(dprintById.linter.pass, false);
assert.equal(dprintById.editorconfig.skipped, false, "formatter must not skip editorconfig");
assert.equal(dprintById.editorconfig.pass, false);
assert.equal(dprintById["type-checker"].skipped, true, dprintById["type-checker"].message);

const noFmtRoot = tmp("code-readiness-nofmt-");
fs.writeFileSync(path.join(noFmtRoot, "package.json"), "{}\n");
const noFmtById = resultById(evaluateRepo(noFmtRoot));
assert.equal(noFmtById.formatter.pass, false, noFmtById.formatter.message);
assert.match(noFmtById.formatter.message, /No formatter configuration found/);
assert.equal(noFmtById["type-checker"].skipped, true, noFmtById["type-checker"].message);

const goModOnlyRoot = tmp("code-readiness-gomod-only-");
fs.writeFileSync(path.join(goModOnlyRoot, "go.mod"), "module example.com/x\n\ngo 1.22\n");
const goModOnlyById = resultById(evaluateRepo(goModOnlyRoot));
assert.equal(goModOnlyById["type-checker"].pass, true, goModOnlyById["type-checker"].message);
assert.equal(goModOnlyById["type-checker"].skipped, false);
assert.match(goModOnlyById["type-checker"].message, /Go has a built-in static type system/);
assert.equal(goModOnlyById.linter.pass, false, "gofmt / go.mod alone is not a linter");
assert.equal(goModOnlyById["setup-script"].pass, false, "go.mod alone is not a setup script");

const tsShadowRoot = tmp("code-readiness-ts-shadow-");
fs.writeFileSync(
  path.join(tsShadowRoot, "tsconfig.json"),
  JSON.stringify({ compilerOptions: { target: "ES2020" } }),
);
fs.writeFileSync(path.join(tsShadowRoot, "go.mod"), "module example.com/x\n\ngo 1.22\n");
const tsShadowById = resultById(evaluateRepo(tsShadowRoot));
assert.equal(tsShadowById["type-checker"].pass, true, tsShadowById["type-checker"].message);
assert.match(tsShadowById["type-checker"].message, /tsconfig\.json/);
assert.equal(/Go has a built-in static type system/.test(tsShadowById["type-checker"].message), false);

const conftestRoot = tmp("code-readiness-conftest-");
fs.mkdirSync(path.join(conftestRoot, "tests"), { recursive: true });
fs.writeFileSync(path.join(conftestRoot, "tests", "conftest.py"), "# pytest fixtures\n");
const conftestById = resultById(evaluateRepo(conftestRoot));
assert.equal(conftestById["test-framework"].pass, true, conftestById["test-framework"].message);
assert.match(conftestById["test-framework"].message, /conftest\.py/);

const pyverRoot = tmp("code-readiness-pyver-");
fs.writeFileSync(
  path.join(pyverRoot, "pyproject.toml"),
  "[project]\nname = \"x\"\nrequires-python = \">=3.10\"\n",
);
const pyverById = resultById(evaluateRepo(pyverRoot));
assert.equal(pyverById["version-pinned"].pass, true, pyverById["version-pinned"].message);
assert.match(pyverById["version-pinned"].message, /requires-python/);

const setupPyPinRoot = tmp("code-readiness-setuppy-pin-");
fs.writeFileSync(
  path.join(setupPyPinRoot, "setup.py"),
  'from setuptools import setup\nsetup(python_requires=">=3.10")\n',
);
const setupPyPinById = resultById(evaluateRepo(setupPyPinRoot));
assert.equal(setupPyPinById["version-pinned"].pass, true, setupPyPinById["version-pinned"].message);
assert.match(setupPyPinById["version-pinned"].message, /python_requires/);
assert.match(setupPyPinById["version-pinned"].message, /setup\.py/);

const ruffTargetRoot = tmp("code-readiness-ruff-target-");
fs.writeFileSync(
  path.join(ruffTargetRoot, "pyproject.toml"),
  "[tool.ruff]\ntarget-version = \"py310\"\n",
);
const ruffTargetById = resultById(evaluateRepo(ruffTargetRoot));
assert.equal(ruffTargetById["version-pinned"].pass, false, ruffTargetById["version-pinned"].message);
assert.match(ruffTargetById["version-pinned"].message, /No runtime version pin found/);

const noPinRoot = tmp("code-readiness-nopin-");
fs.writeFileSync(path.join(noPinRoot, "setup.py"), "from setuptools import setup\nsetup()\n");
const noPinById = resultById(evaluateRepo(noPinRoot));
assert.equal(noPinById["version-pinned"].pass, false, noPinById["version-pinned"].message);
assert.match(noPinById["version-pinned"].message, /No runtime version pin found/);

const makeRoot = tmp("code-readiness-make-");
fs.writeFileSync(path.join(makeRoot, "Makefile"), "all:\n\t@echo ok\n");
const makeById = resultById(evaluateRepo(makeRoot));
assert.equal(makeById["setup-script"].pass, true, makeById["setup-script"].message);
assert.match(makeById["setup-script"].message, /Makefile/);

const licRoot = tmp("code-readiness-lic-");
fs.writeFileSync(path.join(licRoot, "LICENSE-MIT"), "MIT License\n");
const licById = resultById(evaluateRepo(licRoot));
assert.equal(licById.license.pass, true, licById.license.message);
assert.match(licById.license.message, /LICENSE-MIT/);

const ghContribRoot = tmp("code-readiness-ghc-");
fs.mkdirSync(path.join(ghContribRoot, ".github"), { recursive: true });
fs.writeFileSync(path.join(ghContribRoot, ".github", "CONTRIBUTING.md"), "# contributing\n");
const ghContribById = resultById(evaluateRepo(ghContribRoot));
assert.equal(ghContribById.contributing.pass, true, ghContribById.contributing.message);
assert.match(ghContribById.contributing.message, /\.github\/CONTRIBUTING\.md/);

const nodeTestRoot = tmp("code-readiness-nodetest-");
fs.writeFileSync(
  path.join(nodeTestRoot, "package.json"),
  JSON.stringify({ scripts: { test: "node --test" } }),
);
const nodeTestById = resultById(evaluateRepo(nodeTestRoot));
assert.equal(nodeTestById["test-framework"].pass, true, nodeTestById["test-framework"].message);
assert.match(nodeTestById["test-framework"].message, /node --test/);

const nodeDashDashTestRoot = tmp("code-readiness-nodedashtest-");
fs.writeFileSync(
  path.join(nodeDashDashTestRoot, "package.json"),
  JSON.stringify({ scripts: { test: "node -- --test" } }),
);
const nodeDashDashTestById = resultById(evaluateRepo(nodeDashDashTestRoot));
assert.equal(
  nodeDashDashTestById["test-framework"].pass,
  true,
  nodeDashDashTestById["test-framework"].message,
);
assert.match(nodeDashDashTestById["test-framework"].message, /node -- --test/);

const commanderTestRoot = tmp("code-readiness-commander-test-");
fs.writeFileSync(
  path.join(commanderTestRoot, "package.json"),
  JSON.stringify({ scripts: { test: "node --test && npm run check:type:ts" } }),
);
fs.mkdirSync(path.join(commanderTestRoot, "tests"));
fs.writeFileSync(path.join(commanderTestRoot, "tests", "cli.test.js"), "test('ok', () => {});\n");
const commanderTestById = resultById(evaluateRepo(commanderTestRoot));
assert.equal(commanderTestById["test-framework"].pass, true, commanderTestById["test-framework"].message);
assert.match(commanderTestById["test-framework"].message, /node --test/);
assert.equal(commanderTestById["test-script"].pass, true, commanderTestById["test-script"].message);
assert.equal(commanderTestById["test-files-exist"].pass, true);

const noFrameworkRoot = tmp("code-readiness-nofw-");
fs.writeFileSync(
  path.join(noFrameworkRoot, "package.json"),
  JSON.stringify({ scripts: { test: "node test.js" } }),
);
fs.mkdirSync(path.join(noFrameworkRoot, "tests"));
fs.writeFileSync(path.join(noFrameworkRoot, "tests", "cli.test.js"), "test('ok', () => {});\n");
const noFrameworkById = resultById(evaluateRepo(noFrameworkRoot));
assert.equal(noFrameworkById["test-framework"].pass, false, noFrameworkById["test-framework"].message);
assert.match(noFrameworkById["test-framework"].message, /No test framework configuration found/);
assert.equal(noFrameworkById["test-files-exist"].pass, true, noFrameworkById["test-files-exist"].message);
assert.equal(noFrameworkById["test-script"].pass, true, noFrameworkById["test-script"].message);

const nodeBuildOnlyRoot = tmp("code-readiness-nodebuild-");
fs.writeFileSync(
  path.join(nodeBuildOnlyRoot, "package.json"),
  JSON.stringify({ scripts: { test: "node build" } }),
);
const nodeBuildOnlyById = resultById(evaluateRepo(nodeBuildOnlyRoot));
assert.equal(nodeBuildOnlyById["test-framework"].pass, false, nodeBuildOnlyById["test-framework"].message);
assert.match(nodeBuildOnlyById["test-framework"].message, /No test framework configuration found/);

const nodeDashDashGlobRoot = tmp("code-readiness-nodedash-glob-");
fs.writeFileSync(
  path.join(nodeDashDashGlobRoot, "package.json"),
  JSON.stringify({ scripts: { test: "node -- --test 'src/**/*.test.js'" } }),
);
const nodeDashDashGlobById = resultById(evaluateRepo(nodeDashDashGlobRoot));
assert.equal(
  nodeDashDashGlobById["test-framework"].pass,
  true,
  nodeDashDashGlobById["test-framework"].message,
);
assert.match(nodeDashDashGlobById["test-framework"].message, /node -- --test/);

const nodeExtraDashRoot = tmp("code-readiness-nodeextradash-");
fs.writeFileSync(
  path.join(nodeExtraDashRoot, "package.json"),
  JSON.stringify({ scripts: { test: "node -- -- --test" } }),
);
const nodeExtraDashById = resultById(evaluateRepo(nodeExtraDashRoot));
assert.equal(nodeExtraDashById["test-framework"].pass, true, nodeExtraDashById["test-framework"].message);
assert.match(nodeExtraDashById["test-framework"].message, /node -- --test/);

const nodeDashDashOverExtRoot = tmp("code-readiness-nodedash-ext-");
fs.writeFileSync(
  path.join(nodeDashDashOverExtRoot, "package.json"),
  JSON.stringify({ name: "Lib", scripts: { test: "node -- --test" } }),
);
fs.mkdirSync(path.join(nodeDashDashOverExtRoot, "packages", "ext"), { recursive: true });
fs.writeFileSync(
  path.join(nodeDashDashOverExtRoot, "packages", "ext", "package.json"),
  JSON.stringify({ name: "Foo", scripts: { test: "node --test" } }),
);
const nodeDashDashOverExtById = resultById(evaluateRepo(nodeDashDashOverExtRoot));
assert.equal(
  nodeDashDashOverExtById["test-framework"].pass,
  true,
  nodeDashDashOverExtById["test-framework"].message,
);
assert.match(nodeDashDashOverExtById["test-framework"].message, /^package\.json contains node -- --test/);
assert.equal(
  /packages\/ext/.test(nodeDashDashOverExtById["test-framework"].message),
  false,
  nodeDashDashOverExtById["test-framework"].message,
);

const jestDepRoot = tmp("code-readiness-jest-dep-");
fs.writeFileSync(
  path.join(jestDepRoot, "package.json"),
  JSON.stringify({ devDependencies: { jest: "29.0.0" } }),
);
const jestDepById = resultById(evaluateRepo(jestDepRoot));
assert.equal(jestDepById["test-framework"].pass, true, jestDepById["test-framework"].message);
assert.match(jestDepById["test-framework"].message, /"jest"/);

const mochaDepRoot = tmp("code-readiness-mocha-dep-");
fs.writeFileSync(
  path.join(mochaDepRoot, "package.json"),
  JSON.stringify({ devDependencies: { mocha: "10.0.0" } }),
);
const mochaDepById = resultById(evaluateRepo(mochaDepRoot));
assert.equal(mochaDepById["test-framework"].pass, true, mochaDepById["test-framework"].message);
assert.match(mochaDepById["test-framework"].message, /"mocha"/);

const goTestFileRoot = tmp("code-readiness-gotestfile-");
fs.writeFileSync(path.join(goTestFileRoot, "foo_test.go"), "package x\n");
const goTestFileById = resultById(evaluateRepo(goTestFileRoot));
assert.equal(goTestFileById["test-framework"].pass, true, goTestFileById["test-framework"].message);
assert.match(goTestFileById["test-framework"].message, /foo_test\.go/);

const pomJunitRoot = tmp("code-readiness-junit-");
fs.writeFileSync(
  path.join(pomJunitRoot, "pom.xml"),
  "<project><dependency>junit</dependency></project>\n",
);
const pomJunitById = resultById(evaluateRepo(pomJunitRoot));
assert.equal(pomJunitById["test-framework"].pass, true, pomJunitById["test-framework"].message);

const enginesRoot = tmp("code-readiness-engines-");
fs.writeFileSync(
  path.join(enginesRoot, "package.json"),
  JSON.stringify({ engines: { node: ">=18" } }),
);
const enginesById = resultById(evaluateRepo(enginesRoot));
assert.equal(enginesById["version-pinned"].pass, true, enginesById["version-pinned"].message);

const emptyRoot = tmp("code-readiness-empty-");
const emptyEval = evaluateRepo(emptyRoot);
const emptyById = resultById(emptyEval);
const emptyScored = scoreResults(emptyEval.catalog, emptyEval.results);
assert.equal(emptyScored.level, 1);
assert.equal(emptyById["version-pinned"].pass, false, emptyById["version-pinned"].message);
assert.match(emptyById["version-pinned"].message, /No runtime version pin found/);
assert.equal(emptyById.linter.pass, false);
assert.equal(emptyById.linter.skipped, false);
assert.equal(emptyById.editorconfig.pass, false);
assert.equal(emptyById.editorconfig.skipped, false);
assert.equal(emptyById.containerization.pass, false, emptyById.containerization.message);
assert.match(emptyById.containerization.message, /No Dockerfile/);
assert.equal(emptyById["env-documentation"].skipped, true);
assert.equal(emptyById["lock-file"].skipped, false);
assert.equal(emptyById["type-checker"].skipped, true);
assert.equal(
  emptyEval.results.filter((row) => row.skipped).length,
  6,
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
assert.equal(capReport.maturity_level.l1Capped, false);
assert.equal(capReport.maturity_level.l1CapReasons.includes("license"), false);
assert.equal(capReport.maturity_level.l1Passed, 3);
assert.equal(capReport.maturity_level.l1Total, 3);
assert.ok(capReport.maturity_level.l2Total >= 8);
assert.ok(Array.isArray(capReport.languages));
assert.ok(capReport.languages.includes("javascript"));

const functionalRoot = tmp("code-readiness-l1-functional-");
fs.writeFileSync(
  path.join(functionalRoot, "README.md"),
  `${"A".repeat(520)}\n# sample\nsetup and usage.\n`,
);
fs.writeFileSync(path.join(functionalRoot, ".golangci.yml"), "linters: {}\n");
fs.writeFileSync(path.join(functionalRoot, "go.mod"), "module example.com/x\n\ngo 1.22\n");
fs.writeFileSync(path.join(functionalRoot, "foo_test.go"), "package x\n");
const functionalEval = evaluateRepo(functionalRoot);
const functionalById = resultById(functionalEval);
const functionalScored = scoreResults(functionalEval.catalog, functionalEval.results);
assert.equal(functionalById.readme.pass, true);
assert.equal(functionalById.linter.pass, true);
assert.equal(functionalById["test-files-exist"].pass, true);
assert.equal(functionalById["type-checker"].pass, true, functionalById["type-checker"].message);
assert.equal(functionalById["type-checker"].skipped, false);
assert.equal(functionalScored.l1Passed, 4);
assert.equal(functionalScored.l1Total, 4);

const jsFunctionalSkipRoot = tmp("code-readiness-l1-js-");
fs.writeFileSync(
  path.join(jsFunctionalSkipRoot, "README.md"),
  `${"A".repeat(520)}\n# sample\nsetup and usage.\n`,
);
fs.writeFileSync(path.join(jsFunctionalSkipRoot, "eslint.config.js"), "export default [];\n");
fs.writeFileSync(path.join(jsFunctionalSkipRoot, "app.test.js"), "test('ok', () => {});\n");
const jsFunctionalEval = evaluateRepo(jsFunctionalSkipRoot);
const jsFunctionalById = resultById(jsFunctionalEval);
const jsFunctionalScored = scoreResults(jsFunctionalEval.catalog, jsFunctionalEval.results);
assert.equal(jsFunctionalById.readme.pass, true);
assert.equal(jsFunctionalById.linter.pass, true);
assert.equal(jsFunctionalById.editorconfig.skipped, true, jsFunctionalById.editorconfig.message);
assert.equal(jsFunctionalById["test-files-exist"].pass, true);
assert.equal(jsFunctionalById["type-checker"].skipped, true, jsFunctionalById["type-checker"].message);
assert.equal(jsFunctionalScored.l1Passed, 3);
assert.equal(jsFunctionalScored.l1Total, 3);

const identityLieRoot = tmp("code-readiness-identity-");
fs.writeFileSync(path.join(identityLieRoot, "LICENSE"), "MIT\n");
fs.writeFileSync(path.join(identityLieRoot, "package.json"), "{}\n");
fs.writeFileSync(path.join(identityLieRoot, "package-lock.json"), "{}\n");
const identityLieEval = evaluateRepo(identityLieRoot);
const identityLieById = resultById(identityLieEval);
const identityLieScored = scoreResults(identityLieEval.catalog, identityLieEval.results);
assert.equal(identityLieById.license.pass, true);
assert.equal(identityLieById["lock-file"].pass, true);
assert.equal(identityLieById.readme.pass, false);
assert.equal(identityLieById.linter.pass, false);
assert.equal(identityLieById["test-files-exist"].pass, false);
assert.equal(identityLieScored.l1Passed, 0);
assert.ok(identityLieScored.l1Total >= 3);
assert.equal(identityLieScored.level, 1, "license+lock alone is not Functional L1");

assert.equal(/factory|kodus/i.test(ATTRIBUTION), false);

function writeTree(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (content === null) continue;
    fs.writeFileSync(full, typeof content === "string" ? content : `${JSON.stringify(content)}\n`);
  }
}

function evalTree(files) {
  const dir = tmp("code-readiness-pat-");
  writeTree(dir, files);
  return resultById(evaluateRepo(dir));
}

function assertPass(id, files, needle) {
  const byId = evalTree(files);
  assert.equal(byId[id].pass, true, `${id} should pass: ${byId[id].message}`);
  assert.equal(byId[id].skipped, false, `${id} should not skip: ${byId[id].message}`);
  if (needle) assert.match(byId[id].message, needle);
  return byId;
}

function assertFail(id, files, needle) {
  const byId = evalTree(files);
  assert.equal(byId[id].pass, false, `${id} should fail: ${byId[id].message}`);
  if (needle) assert.match(byId[id].message, needle);
  return byId;
}

const linterConfigs = [
  [".golangci.toml", "linters = {}\n"],
  [".golangci.json", "{}\n"],
  [".flake8", "[flake8]\n"],
  [".pylintrc", "[MASTER]\n"],
  ["pylintrc", "[MASTER]\n"],
  ["clippy.toml", "avoid-breaking-exported-api = false\n"],
  [".clippy.toml", "avoid-breaking-exported-api = false\n"],
  [".clang-tidy", "Checks: '-*'\n"],
  [".hlint.yaml", "[]\n"],
  ["hlint.yaml", "[]\n"],
  [".credo.exs", "%{}\n"],
  [".tflint.hcl", "config {}\n"],
  [".shellcheckrc", "disable=SC2086\n"],
  [".luacheckrc", "std = 'lua51'\n"],
  [".jshintrc", "{}\n"],
];
for (const [name, body] of linterConfigs) {
  assertPass("linter", { [name]: body }, new RegExp(name.replace(".", "\\.")));
}

assertPass("linter", { "biome.json": "{}\n" }, /biome\.json/);
assert.equal(evalTree({ "biome.json": "{}\n" }).linter.pass, true);
assert.equal(evalTree({ "eslint.config.js": "export default [];\n" }).linter.pass, true);
assertPass("linter", { "package.json": { devDependencies: { oxlint: "1.0.0" } } }, /oxlint/);
assertPass("linter", { "pyproject.toml": "[tool.pylint]\n" }, /\[tool\.pylint/);
assertPass("linter", { "pyproject.toml": "[tool.flake8]\n" }, /\[tool\.flake8/);
assertPass("linter", { "setup.cfg": "[flake8]\nmax-line-length = 88\n" }, /\[flake8\]/);
assertPass("linter", { "setup.cfg": "[pylint]\n" }, /\[pylint/);
assertPass("linter", { "Cargo.toml": "[package]\nname = \"x\"\n[lints.clippy]\nall = \"warn\"\n" }, /\[lints\.clippy/);
assertPass(
  "linter",
  { "Cargo.toml": "[workspace]\n[workspace.lints]\nrust.unsafe_code = \"warn\"\n" },
  /\[workspace\.lints/,
);
assertPass(
  "linter",
  { "Cargo.toml": "[package]\nname = \"x\"\n[lints.rust]\nunsafe_code = \"warn\"\n" },
  /\[lints\.rust/,
);
assertPass(
  "linter",
  { "pom.xml": "<project><dependency>error_prone_core</dependency></project>\n" },
  /error_prone/,
);
assertPass("linter", { "pom.xml": "<project>errorprone</project>\n" }, /errorprone/);
assertPass("linter", { "package.json": { devDependencies: { standard: "17.0.0" } } }, /standard/);
assertPass("linter", { "package.json": { devDependencies: { xo: "0.58.0" } } }, /xo/);

const clangFmt = evalTree({ ".clang-format": "BasedOnStyle: LLVM\n" });
assert.equal(clangFmt.formatter.pass, true, clangFmt.formatter.message);
assert.match(clangFmt.formatter.message, /\.clang-format/);
assert.equal(clangFmt.linter.pass, false, "formatter is not a linter");
assertFail("formatter", { "deps/jemalloc/.clang-format": "" });
assertFail("formatter", { "deps/jemalloc/.clang-format": "BasedOnStyle: LLVM\n" });
assertFail("formatter", { "third_party/abseil/.clang-format": "BasedOnStyle: LLVM\n" });
assertFail("formatter", { "third-party/foo/.prettierrc": "{}\n" });
assertFail("formatter", { ".clang-format": "" });
assertFail("formatter", { ".prettierrc": "" });
assertFail("formatter", { ".clang-format": "  \n\t\n" });
assertPass("formatter", { ".clang-format": "BasedOnStyle: LLVM\n" }, /\.clang-format/);
assertPass("formatter", { "src/.clang-format": "IndentWidth: 2\n" }, /src\/\.clang-format/);
assertPass("formatter", { ".prettierrc": "{}\n" }, /\.prettierrc/);
assertPass("formatter", { "rustfmt.toml": "max_width = 100\n" }, /rustfmt\.toml/);
assertPass("formatter", { "examples/.prettierrc": "{}\n" }, /examples\/\.prettierrc/);
assertPass(
  "formatter",
  { "biome.json": '{ "formatter": { "indentStyle": "space" } }\n' },
  /biome\.json/,
);
const mixedVendorFmt = evalTree({
  "deps/jemalloc/.clang-format": "",
  ".clang-format": "BasedOnStyle: LLVM\n",
});
assert.equal(mixedVendorFmt.formatter.pass, true, mixedVendorFmt.formatter.message);
assert.match(mixedVendorFmt.formatter.message, /Found \.clang-format/);
assert.equal(/deps/.test(mixedVendorFmt.formatter.message), false);
const mixedDepthFmt = evalTree({
  "packages/app/.prettierrc": "{}\n",
  ".clang-format": "BasedOnStyle: LLVM\n",
});
assert.equal(mixedDepthFmt.formatter.pass, true, mixedDepthFmt.formatter.message);
assert.match(mixedDepthFmt.formatter.message, /Found \.clang-format/);
assert.equal(/packages/.test(mixedDepthFmt.formatter.message), false);
assertPass(
  "formatter",
  {
    ".clang-format": "",
    "biome.json": '{ "formatter": { "enabled": true } }\n',
  },
  /biome\.json/,
);
assertPass("formatter", { ".swift-format": "{}\n" }, /\.swift-format/);
assertPass("formatter", { ".swiftformat": "--indent 2\n" }, /\.swiftformat/);
assertPass("formatter", { ".scalafmt.conf": "version = 3.0.0\n" }, /scalafmt/);
assertPass("formatter", { ".php-cs-fixer.php": "<?php\nreturn [];\n" }, /php-cs-fixer/);
assertPass("formatter", { ".style.yapf": "[style]\nbased_on_style = pep8\n" }, /style\.yapf/);
assertPass("formatter", { ".formatter.exs": "[inputs: \"**/*.{ex,exs}\"]\n" }, /\.formatter\.exs/);
assertFail("formatter", { ".formatter.exs": "" });
assertFail("formatter", { ".formatter.exs": "  \n\t\n" });
assertFail("formatter", { "mix.exs": "defmodule Plug.MixProject do\nend\n" });
assertFail("formatter", { "vendor/hex/.formatter.exs": "[inputs: \"**/*.{ex,exs}\"]\n" });
assertFail("formatter", { "deps/hex/.formatter.exs": "[inputs: \"**/*.{ex,exs}\"]\n" });
const mixFmt = evalTree({ ".formatter.exs": "[inputs: \"**/*.{ex,exs}\"]\n" });
assert.equal(mixFmt.formatter.pass, true, mixFmt.formatter.message);
assert.match(mixFmt.formatter.message, /\.formatter\.exs/);
assert.equal(mixFmt.linter.pass, false, "mix formatter is not a linter");
assert.equal(/built-in formatting/.test(mixFmt.formatter.message), false);
const mixFmtBeatsPrettier = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  ".formatter.exs": "[inputs: \"**/*.{ex,exs}\"]\n",
  "prettier.config.js": "export default { tabWidth: 2 };\n",
});
assert.equal(mixFmtBeatsPrettier.formatter.pass, true, mixFmtBeatsPrettier.formatter.message);
assert.match(mixFmtBeatsPrettier.formatter.message, /\.formatter\.exs/);
assert.equal(
  /prettier/.test(mixFmtBeatsPrettier.formatter.message),
  false,
  mixFmtBeatsPrettier.formatter.message,
);
const mixFmtBeatsBiome = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  ".formatter.exs": "[inputs: \"**/*.{ex,exs}\"]\n",
  "biome.json": '{ "formatter": { "enabled": true } }\n',
});
assert.equal(mixFmtBeatsBiome.formatter.pass, true, mixFmtBeatsBiome.formatter.message);
assert.match(mixFmtBeatsBiome.formatter.message, /\.formatter\.exs/);
assert.equal(/biome/.test(mixFmtBeatsBiome.formatter.message), false, mixFmtBeatsBiome.formatter.message);
const mixPrettierOnly = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "prettier.config.js": "export default { tabWidth: 2 };\n",
});
assert.equal(mixPrettierOnly.formatter.pass, true, mixPrettierOnly.formatter.message);
assert.match(mixPrettierOnly.formatter.message, /prettier\.config\.js/);
const jsOnlyPrettier = evalTree({
  "package.json": { name: "app" },
  "prettier.config.js": "export default { tabWidth: 2 };\n",
});
assert.equal(jsOnlyPrettier.formatter.pass, true, jsOnlyPrettier.formatter.message);
assert.match(jsOnlyPrettier.formatter.message, /prettier\.config\.js/);
const railsFmtBeatsPrettier = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  ".rubocop.yml": "AllCops:\n  NewCops: enable\n",
  "prettier.config.js": "export default { tabWidth: 2 };\n",
});
assert.equal(railsFmtBeatsPrettier.formatter.pass, true, railsFmtBeatsPrettier.formatter.message);
assert.match(railsFmtBeatsPrettier.formatter.message, /\.rubocop\.yml/);
assert.equal(
  /prettier/.test(railsFmtBeatsPrettier.formatter.message),
  false,
  railsFmtBeatsPrettier.formatter.message,
);
const railsFmtBeatsBiome = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  ".rubocop.yml": "AllCops:\n  NewCops: enable\n",
  "biome.json": '{ "formatter": { "enabled": true } }\n',
});
assert.equal(railsFmtBeatsBiome.formatter.pass, true, railsFmtBeatsBiome.formatter.message);
assert.match(railsFmtBeatsBiome.formatter.message, /\.rubocop\.yml/);
assert.equal(/biome/.test(railsFmtBeatsBiome.formatter.message), false, railsFmtBeatsBiome.formatter.message);
const railsYamlBeatsPrettier = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  ".rubocop.yaml": "AllCops:\n  NewCops: enable\n",
  "prettier.config.js": "export default { tabWidth: 2 };\n",
});
assert.equal(railsYamlBeatsPrettier.formatter.pass, true, railsYamlBeatsPrettier.formatter.message);
assert.match(railsYamlBeatsPrettier.formatter.message, /\.rubocop\.yaml/);
assert.equal(
  /prettier/.test(railsYamlBeatsPrettier.formatter.message),
  false,
  railsYamlBeatsPrettier.formatter.message,
);
const railsStandardBeatsPrettier = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  ".standard.yml": "ruby_version: 3.2\n",
  "prettier.config.js": "export default { tabWidth: 2 };\n",
});
assert.equal(railsStandardBeatsPrettier.formatter.pass, true, railsStandardBeatsPrettier.formatter.message);
assert.match(railsStandardBeatsPrettier.formatter.message, /\.standard\.yml/);
assert.equal(
  /prettier/.test(railsStandardBeatsPrettier.formatter.message),
  false,
  railsStandardBeatsPrettier.formatter.message,
);
const railsPrettierOnly = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  "prettier.config.js": "export default { tabWidth: 2 };\n",
});
assert.equal(railsPrettierOnly.formatter.pass, true, railsPrettierOnly.formatter.message);
assert.match(railsPrettierOnly.formatter.message, /prettier\.config\.js/);
assertPass("formatter", { ".rubocop.yaml": "AllCops:\n  NewCops: enable\n" }, /\.rubocop\.yaml/);
assertPass("formatter", { ".standard.yml": "ruby_version: 3.2\n" }, /\.standard\.yml/);
const pyRuffBeatsPrettier = evalTree({
  "pyproject.toml": "[tool.ruff]\nline-length = 88\n",
  "prettier.config.js": "export default { tabWidth: 2 };\n",
});
assert.equal(pyRuffBeatsPrettier.formatter.pass, true, pyRuffBeatsPrettier.formatter.message);
assert.match(pyRuffBeatsPrettier.formatter.message, /pyproject\.toml|ruff\.toml/);
assert.equal(
  /prettier/.test(pyRuffBeatsPrettier.formatter.message),
  false,
  pyRuffBeatsPrettier.formatter.message,
);
const pyRuffTomlBeatsPrettier = evalTree({
  "ruff.toml": "line-length = 88\n",
  "prettier.config.js": "export default { tabWidth: 2 };\n",
});
assert.equal(pyRuffTomlBeatsPrettier.formatter.pass, true, pyRuffTomlBeatsPrettier.formatter.message);
assert.match(pyRuffTomlBeatsPrettier.formatter.message, /ruff\.toml/);
assert.equal(
  /prettier/.test(pyRuffTomlBeatsPrettier.formatter.message),
  false,
  pyRuffTomlBeatsPrettier.formatter.message,
);
const pyBlackBeatsPrettier = evalTree({
  "pyproject.toml": "[tool.black]\nline-length = 88\n",
  "prettier.config.js": "export default { tabWidth: 2 };\n",
});
assert.equal(pyBlackBeatsPrettier.formatter.pass, true, pyBlackBeatsPrettier.formatter.message);
assert.match(pyBlackBeatsPrettier.formatter.message, /pyproject\.toml|\.black/);
assert.equal(
  /prettier/.test(pyBlackBeatsPrettier.formatter.message),
  false,
  pyBlackBeatsPrettier.formatter.message,
);
const pyBlackFileBeatsPrettier = evalTree({
  ".black": "line-length = 88\n",
  "prettier.config.js": "export default { tabWidth: 2 };\n",
});
assert.equal(pyBlackFileBeatsPrettier.formatter.pass, true, pyBlackFileBeatsPrettier.formatter.message);
assert.match(pyBlackFileBeatsPrettier.formatter.message, /\.black/);
assert.equal(
  /prettier/.test(pyBlackFileBeatsPrettier.formatter.message),
  false,
  pyBlackFileBeatsPrettier.formatter.message,
);
const pyRuffBeatsBiome = evalTree({
  "pyproject.toml": "[tool.ruff]\nline-length = 88\n",
  "biome.json": '{ "formatter": { "enabled": true } }\n',
});
assert.equal(pyRuffBeatsBiome.formatter.pass, true, pyRuffBeatsBiome.formatter.message);
assert.match(pyRuffBeatsBiome.formatter.message, /pyproject\.toml|ruff\.toml/);
assert.equal(/biome/.test(pyRuffBeatsBiome.formatter.message), false, pyRuffBeatsBiome.formatter.message);
const pyPrettierOnly = evalTree({
  "pyproject.toml": "[project]\nname = \"demo\"\nversion = \"0.1.0\"\n",
  "prettier.config.js": "export default { tabWidth: 2 };\n",
});
assert.equal(pyPrettierOnly.formatter.pass, true, pyPrettierOnly.formatter.message);
assert.match(pyPrettierOnly.formatter.message, /prettier\.config\.js/);
const jsLinterWithPrettier = evalTree({
  "package.json": { name: "app" },
  "prettier.config.js": "export default { tabWidth: 2 };\n",
  ".golangci.yml": "linters: {}\n",
  "eslint.config.js": "export default [];\n",
});
assert.equal(jsLinterWithPrettier.linter.pass, true, jsLinterWithPrettier.linter.message);
assert.match(jsLinterWithPrettier.linter.message, /eslint\.config\.js/);
assert.equal(/golangci/.test(jsLinterWithPrettier.linter.message), false, jsLinterWithPrettier.linter.message);
const mixExUnitStillBeatsJest = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "test/foo_test.exs": "defmodule FooTest do\nend\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  mixExUnitStillBeatsJest["test-framework"].pass,
  true,
  mixExUnitStillBeatsJest["test-framework"].message,
);
assert.match(mixExUnitStillBeatsJest["test-framework"].message, /foo_test\.exs/);
assert.equal(
  /jest\.config/.test(mixExUnitStillBeatsJest["test-framework"].message),
  false,
  mixExUnitStillBeatsJest["test-framework"].message,
);
const spotlessPom = evalTree({ "pom.xml": "<project><plugin>spotless</plugin></project>\n" });
assert.equal(spotlessPom.formatter.pass, true, spotlessPom.formatter.message);
assert.equal(spotlessPom.linter.pass, false, "spotless is a formatter, not a linter");
const phpCsFixer = evalTree({ ".php-cs-fixer.php": "<?php\nreturn [];\n" });
assert.equal(phpCsFixer.formatter.pass, true);
assert.equal(phpCsFixer.linter.pass, false, "php-cs-fixer is a formatter, not a linter");
assertFail("linter", { ".prettierrc": "{}\n" });
assertFail("linter", { "rustfmt.toml": "max_width = 100\n" });
assertFail("linter", { "README.md": "We use eslint, biome, golangci-lint, and ruff.\n" });
assertFail("linter", { Makefile: "lint:\n\tgolangci-lint run\n", "go.mod": "module example.com/x\n" });
assertPass("linter", { "packages/app/.eslintrc": "{}\n" }, /packages\/app\/\.eslintrc/);
assertPass("linter", { "tests/fixtures/config-file/js/.eslintrc": "" }, /tests\/fixtures\/config-file\/js\/\.eslintrc/);
const mixedRootAndFixtureLint = evalTree({
  "eslint.config.js": "export default [];\n",
  "tests/fixtures/config-file/js/.eslintrc": "",
});
assert.equal(mixedRootAndFixtureLint.linter.pass, true, mixedRootAndFixtureLint.linter.message);
assert.match(mixedRootAndFixtureLint.linter.message, /eslint\.config\.js/);
assert.equal(/fixtures/.test(mixedRootAndFixtureLint.linter.message), false);
const mixedPkgAndFixtureLint = evalTree({
  "packages/app/.eslintrc": "{}\n",
  "fixtures/.eslintrc": "{}\n",
});
assert.equal(mixedPkgAndFixtureLint.linter.pass, true, mixedPkgAndFixtureLint.linter.message);
assert.match(mixedPkgAndFixtureLint.linter.message, /packages\/app\/\.eslintrc/);
assert.equal(/fixtures/.test(mixedPkgAndFixtureLint.linter.message), false);
const twoNestedLint = evalTree({
  "apps/web/.golangci.yml": "linters: {}\n",
  "packages/app/nested/.eslintrc": "{}\n",
});
assert.equal(twoNestedLint.linter.pass, true, twoNestedLint.linter.message);
assert.match(twoNestedLint.linter.message, /apps\/web\/\.golangci\.yml/);
assert.equal(/packages/.test(twoNestedLint.linter.message), false);

const jsPrimaryBothLinters = evalTree({
  "eslint.config.js": "export default [];\n",
  ".golangci.yml": "linters: {}\n",
  "package.json": { name: "app" },
});
assert.equal(jsPrimaryBothLinters.linter.pass, true, jsPrimaryBothLinters.linter.message);
assert.match(jsPrimaryBothLinters.linter.message, /eslint\.config\.js/);
assert.equal(/golangci/.test(jsPrimaryBothLinters.linter.message), false);

const biomePrimaryBothLinters = evalTree({
  "biome.json": "{}\n",
  ".golangci.yml": "linters: {}\n",
  "package.json": { name: "app" },
});
assert.equal(biomePrimaryBothLinters.linter.pass, true, biomePrimaryBothLinters.linter.message);
assert.match(biomePrimaryBothLinters.linter.message, /biome\.json/);
assert.equal(/golangci/.test(biomePrimaryBothLinters.linter.message), false);

const oxlintPrimaryBothLinters = evalTree({
  ".oxlintrc.json": "{}\n",
  ".golangci.yml": "linters: {}\n",
  "package.json": { name: "app" },
});
assert.equal(oxlintPrimaryBothLinters.linter.pass, true, oxlintPrimaryBothLinters.linter.message);
assert.match(oxlintPrimaryBothLinters.linter.message, /\.oxlintrc\.json/);
assert.equal(/golangci/.test(oxlintPrimaryBothLinters.linter.message), false);

assertPass("linter", { ".golangci.yml": "linters: {}\n" }, /\.golangci\.yml/);

const tsGolangciOnly = evalTree({
  "package.json": { name: "typescript" },
  ".golangci.yml": "linters: {}\n",
});
assert.equal(tsGolangciOnly.linter.pass, true, tsGolangciOnly.linter.message);
assert.match(tsGolangciOnly.linter.message, /\.golangci\.yml/);

const goPrimaryBothLinters = evalTree({
  "go.mod": "module example.com/x\n",
  ".golangci.yml": "linters: {}\n",
  "packages/web/eslint.config.js": "export default [];\n",
});
assert.equal(goPrimaryBothLinters.linter.pass, true, goPrimaryBothLinters.linter.message);
assert.match(goPrimaryBothLinters.linter.message, /\.golangci\.yml/);
assert.equal(/eslint/.test(goPrimaryBothLinters.linter.message), false);
const mixedRootAndAssetsLint = evalTree({
  "eslint.config.js": "export default [];\n",
  "assets/eslint.config.js": "export default [];\n",
});
assert.equal(mixedRootAndAssetsLint.linter.pass, true, mixedRootAndAssetsLint.linter.message);
assert.match(mixedRootAndAssetsLint.linter.message, /eslint\.config\.js/);
assert.equal(/assets\//.test(mixedRootAndAssetsLint.linter.message), false);
const assetsOnlyLint = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "assets/eslint.config.js": "export default [];\n",
});
assert.equal(assetsOnlyLint.linter.pass, true, "subtree-only eslint still passes linter");
assert.match(assetsOnlyLint.linter.message, /assets\/eslint\.config\.js/);
assert.equal(assetsOnlyLint.editorconfig.skipped, true, "editorconfig still skips when subtree linter passes");
const emptyAssetsLint = evalTree({ "assets/.eslintrc": "" });
assert.equal(emptyAssetsLint.linter.pass, true, "empty optional linter configs still count");
assert.match(emptyAssetsLint.linter.message, /assets\/\.eslintrc/);
const credoBeatsAssets = evalTree({
  ".credo.exs": "%{}\n",
  "assets/eslint.config.js": "export default [];\n",
});
assert.equal(credoBeatsAssets.linter.pass, true, credoBeatsAssets.linter.message);
assert.match(credoBeatsAssets.linter.message, /\.credo\.exs/);
assert.equal(/assets\//.test(credoBeatsAssets.linter.message), false);
const mixedPkgJsonLint = evalTree({
  "package.json": { devDependencies: { eslint: "9.0.0" } },
  "assets/package.json": { devDependencies: { eslint: "8.0.0" } },
});
assert.equal(mixedPkgJsonLint.linter.pass, true, mixedPkgJsonLint.linter.message);
assert.match(mixedPkgJsonLint.linter.message, /^package\.json contains/);
assert.equal(/assets\//.test(mixedPkgJsonLint.linter.message), false);
const docsSampleLint = evalTree({
  "eslint.config.js": "export default [];\n",
  "docs/samples/.eslintrc": "{}\n",
});
assert.equal(docsSampleLint.linter.pass, true, docsSampleLint.linter.message);
assert.match(docsSampleLint.linter.message, /eslint\.config\.js/);
assert.equal(/docs\//.test(docsSampleLint.linter.message), false);
assertPass("linter", { "docs/samples/.eslintrc": "{}\n" }, /docs\/samples\/\.eslintrc/);
const mixedRootAndFormatPrettier = evalTree({
  ".prettierrc": "{}\n",
  "tests/format/.prettierrc": "{ \"tabWidth\": 2 }\n",
});
assert.equal(mixedRootAndFormatPrettier.formatter.pass, true, mixedRootAndFormatPrettier.formatter.message);
assert.match(mixedRootAndFormatPrettier.formatter.message, /Found \.prettierrc/);
assert.equal(/tests\/format/.test(mixedRootAndFormatPrettier.formatter.message), false);
const mixedRootAndIntegrationPrettier = evalTree({
  "prettier.config.js": "export default { tabWidth: 2 };\n",
  "tests/integration/.prettierrc": "{}\n",
});
assert.equal(mixedRootAndIntegrationPrettier.formatter.pass, true, mixedRootAndIntegrationPrettier.formatter.message);
assert.match(mixedRootAndIntegrationPrettier.formatter.message, /Found prettier\.config\.js/);
assert.equal(/tests\/integration/.test(mixedRootAndIntegrationPrettier.formatter.message), false);
assertPass("formatter", { "tests/format/.prettierrc": "{}\n" }, /tests\/format\/\.prettierrc/);
assertPass("formatter", { "tests/integration/.prettierrc": "{}\n" }, /tests\/integration\/\.prettierrc/);
assertPass(
  "formatter",
  { "packages/app/.prettierrc.json": "{}\n" },
  /packages\/app\/\.prettierrc\.json/,
);
assertPass(
  "linter",
  { "packages/app/eslint.config.mjs": "export default [];\n" },
  /packages\/app\/eslint\.config\.mjs/,
);

assertPass("pre-commit-hooks", { "lefthook.toml": "[pre-commit]\n" }, /lefthook\.toml/);
assertPass("pre-commit-hooks", { ".lefthook.yaml": "pre-commit:\n  commands: {}\n" }, /\.lefthook\.yaml/);
assertPass("pre-commit-hooks", { ".lefthook.toml": "[pre-commit]\n" }, /\.lefthook\.toml/);
assertPass("pre-commit-hooks", { "lefthook.yaml": "pre-commit:\n  commands: {}\n" }, /lefthook\.yaml/);
assertPass("pre-commit-hooks", { ".lintstagedrc": "{}\n" }, /\.lintstagedrc/);
assertPass("pre-commit-hooks", { ".lintstagedrc.json": "{}\n" }, /\.lintstagedrc/);
assertPass("pre-commit-hooks", { ".pre-commit-config.yml": "repos: []\n" }, /\.pre-commit-config\.yml/);
assertPass("pre-commit-hooks", { "package.json": { devDependencies: { husky: "9.0.0" } } }, /husky/);
assertPass("pre-commit-hooks", { "package.json": { "lint-staged": { "*.js": "eslint" } } }, /lint-staged/);
assertPass("pre-commit-hooks", { "package.json": { "simple-git-hooks": { "pre-commit": "lint" } } }, /simple-git-hooks/);
assertFail("pre-commit-hooks", { Makefile: "lint:\n\teslint .\n" });

assertPass("test-framework", { "vitest.config.ts": "export default {}\n" }, /vitest\.config\.ts/);
assertPass("test-framework", { "jest.config.js": "export default {}\n" }, /jest\.config\.js/);
const phoenixLikeFramework = evalTree({
  "mix.exs": "defmodule Phoenix.MixProject do\nend\n",
  "test/foo_test.exs": "defmodule FooTest do\nend\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  phoenixLikeFramework["test-framework"].pass,
  true,
  phoenixLikeFramework["test-framework"].message,
);
assert.match(
  phoenixLikeFramework["test-framework"].message,
  /foo_test\.exs|test_helper/,
);
assert.equal(
  /jest\.config/.test(phoenixLikeFramework["test-framework"].message),
  false,
  phoenixLikeFramework["test-framework"].message,
);
const phoenixHelperFramework = evalTree({
  "mix.exs": "defmodule Phoenix.MixProject do\nend\n",
  "test/test_helper.exs": "ExUnit.start()\n",
  "assets/jest.config.js": "export default {}\n",
});
assert.equal(
  phoenixHelperFramework["test-framework"].pass,
  true,
  phoenixHelperFramework["test-framework"].message,
);
assert.match(phoenixHelperFramework["test-framework"].message, /test_helper\.exs/);
assert.equal(
  /jest\.config/.test(phoenixHelperFramework["test-framework"].message),
  false,
  phoenixHelperFramework["test-framework"].message,
);
const phoenixSpecFramework = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "test/foo_spec.exs": "defmodule FooSpec do\nend\n",
  "vitest.config.ts": "export default {}\n",
});
assert.equal(
  phoenixSpecFramework["test-framework"].pass,
  true,
  phoenixSpecFramework["test-framework"].message,
);
assert.match(phoenixSpecFramework["test-framework"].message, /foo_spec\.exs/);
assert.equal(
  /vitest\.config/.test(phoenixSpecFramework["test-framework"].message),
  false,
  phoenixSpecFramework["test-framework"].message,
);
const mixJestOnly = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(mixJestOnly["test-framework"].pass, true, mixJestOnly["test-framework"].message);
assert.match(mixJestOnly["test-framework"].message, /jest\.config\.js/);
const railsLikeFramework = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  "spec/foo_spec.rb": "RSpec.describe Foo do\nend\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  railsLikeFramework["test-framework"].pass,
  true,
  railsLikeFramework["test-framework"].message,
);
assert.match(
  railsLikeFramework["test-framework"].message,
  /foo_spec\.rb|spec_helper/,
);
assert.equal(
  /jest\.config/.test(railsLikeFramework["test-framework"].message),
  false,
  railsLikeFramework["test-framework"].message,
);
const railsHelperFramework = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  "spec/spec_helper.rb": "RSpec.configure {}\n",
  "assets/jest.config.js": "export default {}\n",
});
assert.equal(
  railsHelperFramework["test-framework"].pass,
  true,
  railsHelperFramework["test-framework"].message,
);
assert.match(railsHelperFramework["test-framework"].message, /spec_helper\.rb/);
assert.equal(
  /jest\.config/.test(railsHelperFramework["test-framework"].message),
  false,
  railsHelperFramework["test-framework"].message,
);
const railsTestFramework = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  "test/foo_test.rb": "class FooTest < Minitest::Test\nend\n",
  "vitest.config.ts": "export default {}\n",
});
assert.equal(
  railsTestFramework["test-framework"].pass,
  true,
  railsTestFramework["test-framework"].message,
);
assert.match(railsTestFramework["test-framework"].message, /foo_test\.rb|test_helper/);
assert.equal(
  /vitest\.config/.test(railsTestFramework["test-framework"].message),
  false,
  railsTestFramework["test-framework"].message,
);
const railsJestOnly = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  "jest.config.js": "export default {}\n",
});
assert.equal(railsJestOnly["test-framework"].pass, true, railsJestOnly["test-framework"].message);
assert.match(railsJestOnly["test-framework"].message, /jest\.config\.js/);
const pythonLikeFramework = evalTree({
  "pyproject.toml": "[project]\nname = \"demo\"\n",
  "tests/test_foo.py": "def test_ok():\n    assert True\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  pythonLikeFramework["test-framework"].pass,
  true,
  pythonLikeFramework["test-framework"].message,
);
assert.match(
  pythonLikeFramework["test-framework"].message,
  /test_foo\.py|conftest|pytest\.ini/,
);
assert.equal(
  /jest\.config/.test(pythonLikeFramework["test-framework"].message),
  false,
  pythonLikeFramework["test-framework"].message,
);
const pythonIniFramework = evalTree({
  "pytest.ini": "[pytest]\n",
  "tests/test_foo.py": "def test_ok():\n    assert True\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  pythonIniFramework["test-framework"].pass,
  true,
  pythonIniFramework["test-framework"].message,
);
assert.match(
  pythonIniFramework["test-framework"].message,
  /test_foo\.py|conftest|pytest\.ini/,
);
assert.equal(
  /jest\.config/.test(pythonIniFramework["test-framework"].message),
  false,
  pythonIniFramework["test-framework"].message,
);
const pythonHelperFramework = evalTree({
  "pyproject.toml": "[project]\nname = \"demo\"\n",
  "tests/conftest.py": "# pytest fixtures\n",
  "assets/jest.config.js": "export default {}\n",
});
assert.equal(
  pythonHelperFramework["test-framework"].pass,
  true,
  pythonHelperFramework["test-framework"].message,
);
assert.match(pythonHelperFramework["test-framework"].message, /conftest\.py/);
assert.equal(
  /jest\.config/.test(pythonHelperFramework["test-framework"].message),
  false,
  pythonHelperFramework["test-framework"].message,
);
const pythonSuffixFramework = evalTree({
  "pyproject.toml": "[project]\nname = \"demo\"\n",
  "pkg/foo_test.py": "def test_ok():\n    assert True\n",
  "vitest.config.ts": "export default {}\n",
});
assert.equal(
  pythonSuffixFramework["test-framework"].pass,
  true,
  pythonSuffixFramework["test-framework"].message,
);
assert.match(pythonSuffixFramework["test-framework"].message, /foo_test\.py|conftest|pytest\.ini/);
assert.equal(
  /vitest\.config/.test(pythonSuffixFramework["test-framework"].message),
  false,
  pythonSuffixFramework["test-framework"].message,
);
const pythonJestOnly = evalTree({
  "pyproject.toml": "[project]\nname = \"demo\"\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(pythonJestOnly["test-framework"].pass, true, pythonJestOnly["test-framework"].message);
assert.match(pythonJestOnly["test-framework"].message, /jest\.config\.js/);
const javaLikeFramework = evalTree({
  "pom.xml": "<project></project>\n",
  "src/test/java/FooTest.java": "class FooTest {}\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  javaLikeFramework["test-framework"].pass,
  true,
  javaLikeFramework["test-framework"].message,
);
assert.match(javaLikeFramework["test-framework"].message, /FooTest\.java/);
assert.equal(
  /jest\.config/.test(javaLikeFramework["test-framework"].message),
  false,
  javaLikeFramework["test-framework"].message,
);
const javaGradleFramework = evalTree({
  "build.gradle": "plugins { id 'java' }\n",
  "src/test/java/FooTests.java": "class FooTests {}\n",
  "vitest.config.ts": "export default {}\n",
});
assert.equal(
  javaGradleFramework["test-framework"].pass,
  true,
  javaGradleFramework["test-framework"].message,
);
assert.match(javaGradleFramework["test-framework"].message, /FooTests\.java/);
assert.equal(
  /vitest\.config/.test(javaGradleFramework["test-framework"].message),
  false,
  javaGradleFramework["test-framework"].message,
);
const javaHelperFramework = evalTree({
  "pom.xml": "<project></project>\n",
  "src/test/java/FooTest.java": "class FooTest {}\n",
  "assets/jest.config.js": "export default {}\n",
});
assert.equal(
  javaHelperFramework["test-framework"].pass,
  true,
  javaHelperFramework["test-framework"].message,
);
assert.match(javaHelperFramework["test-framework"].message, /FooTest\.java/);
assert.equal(
  /jest\.config/.test(javaHelperFramework["test-framework"].message),
  false,
  javaHelperFramework["test-framework"].message,
);
const javaJestOnly = evalTree({
  "pom.xml": "<project></project>\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(javaJestOnly["test-framework"].pass, true, javaJestOnly["test-framework"].message);
assert.match(javaJestOnly["test-framework"].message, /jest\.config\.js/);
const pythonStillBeatsJest = evalTree({
  "pyproject.toml": "[project]\nname = \"demo\"\n",
  "tests/test_foo.py": "def test_ok():\n    assert True\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  pythonStillBeatsJest["test-framework"].pass,
  true,
  pythonStillBeatsJest["test-framework"].message,
);
assert.match(pythonStillBeatsJest["test-framework"].message, /test_foo\.py/);
assert.equal(
  /jest\.config/.test(pythonStillBeatsJest["test-framework"].message),
  false,
  pythonStillBeatsJest["test-framework"].message,
);
const railsStillBeatsJest = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  "spec/foo_spec.rb": "RSpec.describe Foo do\nend\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  railsStillBeatsJest["test-framework"].pass,
  true,
  railsStillBeatsJest["test-framework"].message,
);
assert.match(railsStillBeatsJest["test-framework"].message, /foo_spec\.rb/);
assert.equal(
  /jest\.config/.test(railsStillBeatsJest["test-framework"].message),
  false,
  railsStillBeatsJest["test-framework"].message,
);
const csharpLikeFramework = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "FooTests.cs": "class FooTests {}\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  csharpLikeFramework["test-framework"].pass,
  true,
  csharpLikeFramework["test-framework"].message,
);
assert.match(csharpLikeFramework["test-framework"].message, /FooTests\.cs/);
assert.equal(
  /jest\.config/.test(csharpLikeFramework["test-framework"].message),
  false,
  csharpLikeFramework["test-framework"].message,
);
const csharpSlnFramework = evalTree({
  "Foo.sln": "\n",
  "FooTest.cs": "class FooTest {}\n",
  "vitest.config.ts": "export default {}\n",
});
assert.equal(
  csharpSlnFramework["test-framework"].pass,
  true,
  csharpSlnFramework["test-framework"].message,
);
assert.match(csharpSlnFramework["test-framework"].message, /FooTest\.cs/);
assert.equal(
  /vitest\.config/.test(csharpSlnFramework["test-framework"].message),
  false,
  csharpSlnFramework["test-framework"].message,
);
const csharpHelperFramework = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "FooTests.cs": "class FooTests {}\n",
  "assets/jest.config.js": "export default {}\n",
});
assert.equal(
  csharpHelperFramework["test-framework"].pass,
  true,
  csharpHelperFramework["test-framework"].message,
);
assert.match(csharpHelperFramework["test-framework"].message, /FooTests\.cs/);
assert.equal(
  /jest\.config/.test(csharpHelperFramework["test-framework"].message),
  false,
  csharpHelperFramework["test-framework"].message,
);
const csharpJestOnly = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(csharpJestOnly["test-framework"].pass, true, csharpJestOnly["test-framework"].message);
assert.match(csharpJestOnly["test-framework"].message, /jest\.config\.js/);
const csharpFuzzStillJest = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "FuzzTests.cs": "class FuzzTests {}\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  csharpFuzzStillJest["test-framework"].pass,
  true,
  csharpFuzzStillJest["test-framework"].message,
);
assert.match(csharpFuzzStillJest["test-framework"].message, /jest\.config\.js/);
assert.equal(
  /FuzzTests/.test(csharpFuzzStillJest["test-framework"].message),
  false,
  csharpFuzzStillJest["test-framework"].message,
);
const csharpBenchStillJest = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "BenchmarkTests.cs": "class BenchmarkTests {}\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  csharpBenchStillJest["test-framework"].pass,
  true,
  csharpBenchStillJest["test-framework"].message,
);
assert.match(csharpBenchStillJest["test-framework"].message, /jest\.config\.js/);
const javaStillBeatsJest = evalTree({
  "pom.xml": "<project></project>\n",
  "src/test/java/FooTest.java": "class FooTest {}\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  javaStillBeatsJest["test-framework"].pass,
  true,
  javaStillBeatsJest["test-framework"].message,
);
assert.match(javaStillBeatsJest["test-framework"].message, /FooTest\.java/);
assert.equal(
  /jest\.config/.test(javaStillBeatsJest["test-framework"].message),
  false,
  javaStillBeatsJest["test-framework"].message,
);
const mixStillBeatsJest = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "test/foo_test.exs": "defmodule FooTest do\nend\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  mixStillBeatsJest["test-framework"].pass,
  true,
  mixStillBeatsJest["test-framework"].message,
);
assert.match(mixStillBeatsJest["test-framework"].message, /foo_test\.exs/);
assert.equal(
  /jest\.config/.test(mixStillBeatsJest["test-framework"].message),
  false,
  mixStillBeatsJest["test-framework"].message,
);
assertPass(
  "test-framework",
  { "sample/01-cats-app/vitest.config.e2e.mts": "export default {}\n" },
  /sample\/01-cats-app\/vitest\.config\.e2e\.mts/,
);
const nestRootVitest = evalTree({
  "vitest.config.ts": "export default {}\n",
  "sample/01-cats-app/vitest.config.e2e.mts": "export default {}\n",
});
assert.equal(nestRootVitest["test-framework"].pass, true, nestRootVitest["test-framework"].message);
assert.match(nestRootVitest["test-framework"].message, /vitest\.config\.ts/);
assert.equal(/sample\//.test(nestRootVitest["test-framework"].message), false);
const nestCoverageSidecar = evalTree({
  "vitest.config.mts": "export default {}\n",
  "vitest.config.coverage.mts": "export default {}\n",
});
assert.equal(nestCoverageSidecar["test-framework"].pass, true, nestCoverageSidecar["test-framework"].message);
assert.match(nestCoverageSidecar["test-framework"].message, /^Found vitest\.config\.mts$/);
assert.equal(/coverage/.test(nestCoverageSidecar["test-framework"].message), false);
assertPass(
  "test-framework",
  { "vitest.config.coverage.mts": "export default {}\n" },
  /^Found vitest\.config\.coverage\.mts$/,
);
assertPass(
  "test-framework",
  { "vitest.config.coverage.ts": "export default {}\n" },
  /^Found vitest\.config\.coverage\.ts$/,
);
const nestIntegrationSidecar = evalTree({
  "vitest.config.mts": "export default {}\n",
  "vitest.config.integration.mts": "export default {}\n",
});
assert.equal(
  nestIntegrationSidecar["test-framework"].pass,
  true,
  nestIntegrationSidecar["test-framework"].message,
);
assert.match(nestIntegrationSidecar["test-framework"].message, /^Found vitest\.config\.mts$/);
assert.equal(/integration/.test(nestIntegrationSidecar["test-framework"].message), false);
assertPass(
  "test-framework",
  { "vitest.config.integration.mts": "export default {}\n" },
  /^Found vitest\.config\.integration\.mts$/,
);
assertPass(
  "test-framework",
  { "sample/15-mvc/vitest.config.mts": "export default {}\n" },
  /sample\/15-mvc\/vitest\.config\.mts/,
);
const jestCoverageSidecar = evalTree({
  "jest.config.js": "export default {}\n",
  "jest.config.coverage.js": "export default {}\n",
});
assert.equal(jestCoverageSidecar["test-framework"].pass, true, jestCoverageSidecar["test-framework"].message);
assert.match(jestCoverageSidecar["test-framework"].message, /^Found jest\.config\.js$/);
assert.equal(/coverage/.test(jestCoverageSidecar["test-framework"].message), false);
const nestLikeFramework = evalTree({
  "package.json": { scripts: { test: "jest" }, devDependencies: { jest: "29.0.0" } },
  "sample/01-cats-app/vitest.config.e2e.mts": "export default {}\n",
});
assert.equal(nestLikeFramework["test-framework"].pass, true, nestLikeFramework["test-framework"].message);
assert.match(nestLikeFramework["test-framework"].message, /package\.json/);
assert.equal(/vitest\.config/.test(nestLikeFramework["test-framework"].message), false);
const flaskLikeConftest = evalTree({
  "tests/conftest.py": "# pytest fixtures\n",
  "examples/javascript/tests/conftest.py": "# example fixtures\n",
});
assert.equal(flaskLikeConftest["test-framework"].pass, true, flaskLikeConftest["test-framework"].message);
assert.match(flaskLikeConftest["test-framework"].message, /tests\/conftest\.py/);
assert.equal(/examples\//.test(flaskLikeConftest["test-framework"].message), false);
const flaskLikePyproject = evalTree({
  "pyproject.toml": "[tool.pytest.ini_options]\n",
  "examples/javascript/tests/conftest.py": "# example fixtures\n",
});
assert.equal(flaskLikePyproject["test-framework"].pass, true, flaskLikePyproject["test-framework"].message);
assert.match(flaskLikePyproject["test-framework"].message, /pyproject\.toml/);
assert.equal(/examples\//.test(flaskLikePyproject["test-framework"].message), false);
const zodLikeDocsVitest = evalTree({
  "vitest.config.ts": "export default {}\n",
  "packages/docs/vitest.config.ts": "export default {}\n",
});
assert.equal(zodLikeDocsVitest["test-framework"].pass, true, zodLikeDocsVitest["test-framework"].message);
assert.match(zodLikeDocsVitest["test-framework"].message, /^Found vitest\.config\.ts$/);
assert.equal(/packages\/docs/.test(zodLikeDocsVitest["test-framework"].message), false);
const reactLikeCompilerJest = evalTree({
  "jest.config.js": "export default {}\n",
  "compiler/packages/babel-plugin-react-compiler/jest.config.js": "export default {}\n",
  "compiler/crates/react_compiler_ast/tests/deep_nesting.rs": "#[test] fn ok() {}\n",
});
assert.equal(reactLikeCompilerJest["test-framework"].pass, true, reactLikeCompilerJest["test-framework"].message);
assert.match(reactLikeCompilerJest["test-framework"].message, /jest\.config\.js/);
assert.equal(/compiler\//.test(reactLikeCompilerJest["test-framework"].message), false);
assertPass("test-framework", { "phpunit.xml": "<phpunit></phpunit>\n" }, /phpunit\.xml/);
assertPass("test-framework", { "phpunit.xml.dist": "<phpunit></phpunit>\n" }, /phpunit\.xml\.dist/);
assertPass("test-framework", { ".rspec": "--require spec_helper\n" }, /\.rspec/);
assertPass("test-framework", { "spec/spec_helper.rb": "RSpec.configure {}\n" }, /spec_helper/);
assertPass("test-framework", { "tests/integration.rs": "#[test] fn ok() {}\n" }, /tests\/integration\.rs/);
assertPass(
  "test-framework",
  { "src/lib_test.rs": "#[test] fn ok() {}\n" },
  /lib_test\.rs/,
);
assertPass(
  "test-framework",
  { "Cargo.toml": "[package]\nname = \"x\"\n\n[[test]]\nname = \"extra\"\n" },
  /\[\[test\]\]/,
);
assertFail(
  "test-framework",
  { "Cargo.toml": "[package]\nname = \"x\"\nversion = \"0.1.0\"\n" },
  /No test framework/,
);
assertFail("test-framework", { "rustfmt.toml": "max_width = 100\n" });
assertPass(
  "test-framework",
  { "CMakeLists.txt": "cmake_minimum_required(VERSION 3.20)\nenable_testing()\n" },
  /enable_testing/,
);
assertPass("test-framework", { "tests/math_test.c": "int main() { return 0; }\n" }, /math_test\.c/);
assertFail("test-framework", { "README.md": "Run the test suite often.\n" });
assertFail("test-framework", { "CMakeLists.txt": "project(demo)\n" });
assertFail("test-framework", { "Foo.csproj": "<Project></Project>\n" });
assertFail("test-framework", { "Src/Foo/Foo.csproj": "<Project></Project>\n" });
assertPass(
  "test-framework",
  { "Src/Lib.Tests/Lib.Tests.csproj": "<Project></Project>\n" },
  /Lib\.Tests\.csproj/,
);
assertPass(
  "test-framework",
  { "Foo.Tests.csproj": "<Project></Project>\n" },
  /Foo\.Tests\.csproj/,
);
assertPass(
  "test-framework",
  { "Foo.Test.csproj": "<Project></Project>\n" },
  /Foo\.Test\.csproj/,
);
assertPass(
  "test-framework",
  { "Foo.csproj": "<Project><PackageReference Include=\"xunit\" /></Project>\n" },
  /xunit/,
);
assertPass(
  "test-framework",
  { "Src/Lib/Lib.csproj": "<Project><PackageReference Include=\"xunit\" /></Project>\n" },
  /xunit/,
);
assertPass(
  "test-framework",
  { "Bar.csproj": "<Project><PackageReference Include=\"nunit\" /></Project>\n" },
  /nunit/,
);
assertPass(
  "test-framework",
  { "Baz.csproj": "<Project><PackageReference Include=\"MSTest.TestFramework\" /></Project>\n" },
  /MSTest/,
);
const testsOverFuzzFramework = evalTree({
  "Src/Lib.FuzzTests/Lib.FuzzTests.csproj": "<Project></Project>\n",
  "Src/Lib.Tests/Lib.Tests.csproj": "<Project></Project>\n",
});
assert.equal(
  testsOverFuzzFramework["test-framework"].pass,
  true,
  testsOverFuzzFramework["test-framework"].message,
);
assert.match(testsOverFuzzFramework["test-framework"].message, /Lib\.Tests\.csproj/);
assert.equal(
  /FuzzTests/.test(testsOverFuzzFramework["test-framework"].message),
  false,
  testsOverFuzzFramework["test-framework"].message,
);
assertPass(
  "test-framework",
  { "Src/Lib.FuzzTests/Lib.FuzzTests.csproj": "<Project></Project>\n" },
  /Lib\.FuzzTests\.csproj/,
);

assertPass("test-files-exist", { "pkg/foo_test.py": "def test_ok():\n    assert True\n" });
assertPass("test-files-exist", { "src/lib_test.rs": "#[test] fn ok() {}\n" });
assertPass("test-files-exist", { "pkg/tests/foo.rs": "#[test] fn ok() {}\n" });
assertPass("test-files-exist", { "tokio/tests/foo.rs": "#[test] fn ok() {}\n" });
assertPass("test-files-exist", { "test/router.js": "describe('r', () => {});\n" });
assertFail("test-files-exist", { "test/fixtures/foo.js": "module.exports = {};\n" });
assertFail("test-files-exist", { "test/snapshots/out.js": "module.exports = {};\n" });
assertPass("test-files-exist", { "tests/unit.tcl": "test ok {}\n" });
assertPass("test-files-exist", { "tests/man.test": "jq filter\n" });
assertPass("test-files-exist", { "test/Spec.hs": "main = putStrLn \"ok\"\n" });
assertPass("test-files-exist", { "math_test.c": "int main() { return 0; }\n" });
assertPass("test-files-exist", { "math_test.cpp": "int main() { return 0; }\n" });
assertPass("test-files-exist", { "test/main.c": "int main() { return 0; }\n" });
assertPass("test-files-exist", { "FooSpec.hs": "main = putStrLn \"ok\"\n" });
assertPass("test-files-exist", { "FooTest.hs": "main = putStrLn \"ok\"\n" });
assertPass("test-files-exist", { "test/phoenix/endpoint_test.exs": "defmodule Phoenix.EndpointTest do\nend\n" });
assertPass("test-files-exist", { "test/ecto/schema_spec.exs": "defmodule Ecto.SchemaSpec do\nend\n" });
assertPass("test-files-exist", { "core/src/test/scala/cats/FunctorSpec.scala": "class FunctorSpec\n" });
assertPass("test-files-exist", { "core/src/test/scala/cats/FunctorTest.scala": "class FunctorTest\n" });
assertPass("test-files-exist", {
  "tests/shared/src/test/scala/cats/tests/FoldableSuite.scala": "class FoldableSuite\n",
});
assertPass("test-files-exist", {
  "tests/SelfTest/UsageTests/Approx.tests.cpp": "TEST_CASE(\"approx\") {}\n",
});
assertPass("test-files-exist", { "tests/src/unit-algorithms.cpp": "TEST_CASE(\"algo\") {}\n" });
assertPass("test-files-exist", { "spec/models/user_spec.rb": "RSpec.describe User do\nend\n" });
assertPass("test-files-exist", { "test/models/user_test.rb": "class UserTest < Minitest::Test\nend\n" });
assertPass("test-files-exist", {
  "test/active_job_adapter_test.rb": "class ActiveJobAdapterTest < Minitest::Test\nend\n",
});
assertPass("test-files-exist", {
  "activerecord/test/cases/base_test.rb": "class BasicsTest < ActiveRecord::TestCase\nend\n",
});
const jekyllPrefix = assertPass(
  "test-files-exist",
  { "test/test_site.rb": "# jekyll\n" },
  /test\/test_site\.rb/,
);
assert.match(jekyllPrefix["test-files-exist"].message, /Found 1 test file\(s\)/);
assert.equal(jekyllPrefix["test-files-exist"].details, "test/test_site.rb");

const jekyllOverFixtureJs = evalTree({
  "test/test_site.rb": "# jekyll\n",
  "test/source/assets/base.js": "x\n",
});
assert.equal(jekyllOverFixtureJs["test-files-exist"].pass, true, jekyllOverFixtureJs["test-files-exist"].message);
assert.equal(jekyllOverFixtureJs["test-files-exist"].message.includes("Found 2 test file(s)"), true);
assert.match(jekyllOverFixtureJs["test-files-exist"].message, /test\/test_site\.rb/);
assert.match(jekyllOverFixtureJs["test-files-exist"].details, /^test\/test_site\.rb\b/);
assertFail("test-files-exist", { "testdata/test_site.rb": "# jekyll\n" });
assertFail("test-files-exist", { "lib/test_site.rb": "# jekyll\n" });
assertFail("test-files-exist", { "tsconfig.spec.json": "{}" });
assertFail("test-files-exist", { "tsconfig.test.json": "{}" });
assertFail("test-files-exist", { "packages/docs/tsconfig.test.json": "{}" });
assertFail("test-files-exist", { "jsconfig.spec.json": "{}" });
assertPass("test-files-exist", { "foo.test.js": "test('ok');\n" }, /foo\.test\.js/);
assertPass("test-files-exist", { "bar.spec.ts": "test('ok');\n" }, /bar\.spec\.ts/);

const nestTsconfigFirstHit = evalTree({
  "tsconfig.spec.json": "{}",
  "src/app.controller.spec.ts": "test('ok');\n",
});
assert.equal(nestTsconfigFirstHit["test-files-exist"].pass, true, nestTsconfigFirstHit["test-files-exist"].message);
assert.match(nestTsconfigFirstHit["test-files-exist"].message, /Found 1 test file\(s\)/);
assert.match(nestTsconfigFirstHit["test-files-exist"].message, /src\/app\.controller\.spec\.ts/);
assert.equal(/tsconfig\.spec\.json/.test(nestTsconfigFirstHit["test-files-exist"].message), false);
assert.equal(nestTsconfigFirstHit["test-files-exist"].details, "src/app.controller.spec.ts");

const zodTsconfigFirstHit = evalTree({
  "vitest.config.ts": "export default {};\n",
  "packages/docs/tsconfig.test.json": "{}",
  "src/index.test.ts": "test('ok');\n",
});
assert.equal(zodTsconfigFirstHit["test-files-exist"].pass, true, zodTsconfigFirstHit["test-files-exist"].message);
assert.match(zodTsconfigFirstHit["test-files-exist"].message, /src\/index\.test\.ts/);
assert.equal(/tsconfig\.test\.json/.test(zodTsconfigFirstHit["test-files-exist"].message), false);
assert.match(zodTsconfigFirstHit["test-files-exist"].details, /^src\/index\.test\.ts\b/);
assert.equal(zodTsconfigFirstHit["test-files-exist"].message.includes("Found 1 test file(s)"), true);
assertPass("test-files-exist", { "test/format-test.cc": "TEST(FormatTest, Escape) {}\n" });
assertPass("test-files-exist", { "absl/strings/str_cat_test.cc": "TEST(StrCat, Basics) {}\n" });
assertPass("test-files-exist", { "tests/unit-conversions.cc": "TEST_CASE(\"conv\") {}\n" });
assertPass("test-files-exist", { "test/itkImageTest.cxx": "int main() { return 0; }\n" });
assertPass("test-files-exist", { "tests/mesh_test.cxx": "int main() { return 0; }\n" });
assertFail("test-files-exist", { "lib/user.rb": "class User\nend\n" });
assertFail("test-files-exist", { "testdata/user_test.rb": "class UserTest\nend\n" });
assertFail("test-files-exist", { "test/fixtures/user_test.rb": "class UserTest\nend\n" });
assertFail("test-files-exist", { "src/format.cc": "int x;\n" });
assertFail("test-files-exist", { "src/format.cxx": "int x;\n" });
assertFail("test-files-exist", { "test/fixtures/format-test.cc": "int x;\n" });
assertFail("test-files-exist", { "src/foo.cpp": "int main() { return 0; }\n" });
assertFail("test-files-exist", { "src/json.cpp": "int x;\n" });
assertFail("test-files-exist", { "lib/phoenix/endpoint.ex": "defmodule Phoenix.Endpoint do\nend\n" });
assertFail("test-files-exist", { "scripts/add_latest_release_date.py": "print('ok')\n" });
assertFail("test-files-exist", { "parse_test_outputs.py": "print('ok')\n" });
assertFail("test-files-exist", { "check_test_missing.py": "print('ok')\n" });
assertFail("test-files-exist", { "utils/parse_test_outputs.py": "print('ok')\n" });
assertPass("test-files-exist", { "tests/test_client.py": "def test_ok():\n    assert True\n" });
assertPass("test-files-exist", { "test_client.py": "def test_ok():\n    assert True\n" });
const hiddenInVendor = evalTree({
  "node_modules/pkg/foo_test.py": "def test_ok():\n    assert True\n",
  "vendor/lib_test.rs": "#[test] fn ok() {}\n",
});
assert.equal(hiddenInVendor["test-files-exist"].pass, false);

const scalaDoubleMatch = evalTree({
  "src/test/scala/foo/BarSpec.scala": "class BarSpec\n",
  "src/test/scala/foo/BazTest.scala": "class BazTest\n",
});
assert.equal(scalaDoubleMatch["test-files-exist"].pass, true);
assert.match(scalaDoubleMatch["test-files-exist"].message, /Found 2 test file\(s\)/);
assert.equal(
  scalaDoubleMatch["test-files-exist"].details,
  "src/test/scala/foo/BarSpec.scala, src/test/scala/foo/BazTest.scala",
);

const singleDoubleMatch = evalTree({ "test/router.test.js": "describe('r', () => {});\n" });
assert.match(singleDoubleMatch["test-files-exist"].message, /Found 1 test file\(s\)/);
assert.equal(singleDoubleMatch["test-files-exist"].details, "test/router.test.js");

const railsFirstHit = evalTree({
  "actioncable/rollup.config.test.js": "export default {};\n",
  "activerecord/test/cases/base_test.rb": "class BasicsTest < ActiveRecord::TestCase\nend\n",
});
assert.equal(railsFirstHit["test-files-exist"].pass, true, railsFirstHit["test-files-exist"].message);
assert.match(railsFirstHit["test-files-exist"].message, /activerecord\/test\/cases\/base_test\.rb/);
assert.equal(/rollup\.config\.test\.js/.test(railsFirstHit["test-files-exist"].message), false);
assert.match(railsFirstHit["test-files-exist"].details, /^activerecord\/test\/cases\/base_test\.rb\b/);
assert.equal(railsFirstHit["test-files-exist"].message.includes("Found 2 test file(s)"), true);

const phoenixFirstHit = evalTree({
  "installer/test/phx_new_ecto_test.exs": "defmodule PhxNewEctoTest do\nend\n",
  "test/foo_test.exs": "defmodule FooTest do\nend\n",
});
assert.equal(phoenixFirstHit["test-files-exist"].pass, true, phoenixFirstHit["test-files-exist"].message);
assert.match(phoenixFirstHit["test-files-exist"].message, /test\/foo_test\.exs/);
assert.equal(/installer\//.test(phoenixFirstHit["test-files-exist"].message), false);
assert.match(phoenixFirstHit["test-files-exist"].details, /^test\/foo_test\.exs\b/);

const ectoFirstHit = evalTree({
  "examples/friends/test/friends_test.exs": "defmodule FriendsTest do\nend\n",
  "test/ecto_test.exs": "defmodule EctoTest do\nend\n",
});
assert.equal(ectoFirstHit["test-files-exist"].pass, true, ectoFirstHit["test-files-exist"].message);
assert.match(ectoFirstHit["test-files-exist"].message, /test\/ecto_test\.exs/);
assert.equal(/examples\//.test(ectoFirstHit["test-files-exist"].message), false);
assert.equal(ectoFirstHit["test-files-exist"].details.startsWith("test/ecto_test.exs"), true);

const nlohmannFirstHit = evalTree({
  "tests/abi/config/custom.cpp": "int main() { return 0; }\n",
  "tests/src/unit-json.cpp": "TEST_CASE(\"json\") {}\n",
});
assert.equal(nlohmannFirstHit["test-files-exist"].pass, true, nlohmannFirstHit["test-files-exist"].message);
assert.match(nlohmannFirstHit["test-files-exist"].message, /tests\/src\/unit-json\.cpp/);
assert.equal(/\/abi\//.test(nlohmannFirstHit["test-files-exist"].message), false);
assert.match(nlohmannFirstHit["test-files-exist"].details, /^tests\/src\/unit-json\.cpp\b/);

const installerOnly = evalTree({
  "installer/test/phx_new_ecto_test.exs": "defmodule PhxNewEctoTest do\nend\n",
});
assert.equal(installerOnly["test-files-exist"].pass, true, installerOnly["test-files-exist"].message);
assert.match(installerOnly["test-files-exist"].message, /installer\/test\/phx_new_ecto_test\.exs/);

const examplesOnly = evalTree({
  "examples/friends/test/friends_test.exs": "defmodule FriendsTest do\nend\n",
});
assert.equal(examplesOnly["test-files-exist"].pass, true, examplesOnly["test-files-exist"].message);
assert.match(examplesOnly["test-files-exist"].message, /examples\/friends\/test\/friends_test\.exs/);

const abiOnly = evalTree({
  "tests/abi/config/custom.cpp": "int main() { return 0; }\n",
});
assert.equal(abiOnly["test-files-exist"].pass, true, abiOnly["test-files-exist"].message);
assert.match(abiOnly["test-files-exist"].message, /tests\/abi\/config\/custom\.cpp/);

const fmtCTest = evalTree({ "test/c-test.c": "int main() { return 0; }\n" });
assert.equal(fmtCTest["test-files-exist"].pass, true, fmtCTest["test-files-exist"].message);
assert.match(fmtCTest["test-files-exist"].message, /test\/c-test\.c/);

const catch2SelfTest = evalTree({
  "tests/SelfTest/IntrospectiveTests/Algorithms.tests.cpp": "TEST_CASE(\"algo\") {}\n",
});
assert.equal(catch2SelfTest["test-files-exist"].pass, true, catch2SelfTest["test-files-exist"].message);
assert.match(catch2SelfTest["test-files-exist"].message, /Algorithms\.tests\.cpp/);

const tsGoSidecarTfe = evalTree({
  "src/foo.test.ts": "test('ok');\n",
  "tools/customlint/plugin_test.go": "package plugin\n",
});
assert.equal(tsGoSidecarTfe["test-files-exist"].pass, true, tsGoSidecarTfe["test-files-exist"].message);
assert.equal(tsGoSidecarTfe["test-files-exist"].message.includes("Found 2 test file(s)"), true);
assert.match(tsGoSidecarTfe["test-files-exist"].message, /foo\.test\.ts/);
assert.equal(/plugin_test\.go/.test(tsGoSidecarTfe["test-files-exist"].message), false);
assert.match(tsGoSidecarTfe["test-files-exist"].details, /^src\/foo\.test\.ts\b/);
assert.match(tsGoSidecarTfe["test-files-exist"].details, /plugin_test\.go/);
assert.equal(tsGoSidecarTfe["test-framework"].pass, true, tsGoSidecarTfe["test-framework"].message);
assert.match(tsGoSidecarTfe["test-framework"].message, /plugin_test\.go/);

const jsGoSidecarTfe = evalTree({
  "src/foo.test.js": "test('ok');\n",
  "tools/customlint/plugin_test.go": "package plugin\n",
});
assert.equal(jsGoSidecarTfe["test-files-exist"].pass, true, jsGoSidecarTfe["test-files-exist"].message);
assert.match(jsGoSidecarTfe["test-files-exist"].message, /foo\.test\.js/);
assert.equal(/plugin_test\.go/.test(jsGoSidecarTfe["test-files-exist"].message), false);

const mjsGoSidecarTfe = evalTree({
  "src/foo.test.mjs": "test('ok');\n",
  "tools/customlint/plugin_test.go": "package plugin\n",
});
assert.equal(mjsGoSidecarTfe["test-files-exist"].pass, true, mjsGoSidecarTfe["test-files-exist"].message);
assert.match(mjsGoSidecarTfe["test-files-exist"].message, /foo\.test\.mjs/);
assert.equal(/plugin_test\.go/.test(mjsGoSidecarTfe["test-files-exist"].message), false);

const tsxGoSidecarTfe = evalTree({
  "src/foo.test.tsx": "test('ok');\n",
  "tools/customlint/plugin_test.go": "package plugin\n",
});
assert.equal(tsxGoSidecarTfe["test-files-exist"].pass, true, tsxGoSidecarTfe["test-files-exist"].message);
assert.match(tsxGoSidecarTfe["test-files-exist"].message, /foo\.test\.tsx/);
assert.equal(/plugin_test\.go/.test(tsxGoSidecarTfe["test-files-exist"].message), false);

assertPass(
  "test-files-exist",
  { "tools/customlint/plugin_test.go": "package plugin\n" },
  /plugin_test\.go/,
);
assertPass("test-framework", { "tools/customlint/plugin_test.go": "package plugin\n" }, /plugin_test\.go/);

const goPrimaryTfe = evalTree({
  "go.mod": "module example.com/foo\n",
  "foo_test.go": "package foo\n",
});
assert.equal(goPrimaryTfe["test-files-exist"].pass, true, goPrimaryTfe["test-files-exist"].message);
assert.match(goPrimaryTfe["test-files-exist"].message, /foo_test\.go/);
assert.equal(goPrimaryTfe["test-framework"].pass, true, goPrimaryTfe["test-framework"].message);
assert.match(goPrimaryTfe["test-framework"].message, /foo_test\.go/);

const tsGoSidecarFramework = evalTree({
  "src/foo.test.ts": "test('ok');\n",
  "tools/customlint/plugin_test.go": "package plugin\n",
  "package.json": { devDependencies: { jest: "29.0.0" } },
});
assert.equal(tsGoSidecarFramework["test-files-exist"].pass, true, tsGoSidecarFramework["test-files-exist"].message);
assert.match(tsGoSidecarFramework["test-files-exist"].message, /foo\.test\.ts/);
assert.equal(/plugin_test\.go/.test(tsGoSidecarFramework["test-files-exist"].message), false);
assert.equal(tsGoSidecarFramework["test-files-exist"].message.includes("Found 2 test file(s)"), true);
assert.equal(tsGoSidecarFramework["test-framework"].pass, true, tsGoSidecarFramework["test-framework"].message);
assert.match(tsGoSidecarFramework["test-framework"].message, /package\.json|"jest"/);
assert.equal(/plugin_test\.go/.test(tsGoSidecarFramework["test-framework"].message), false);

const mixExUnitOverJsTfe = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "test/foo_test.exs": "defmodule FooTest do\nend\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(mixExUnitOverJsTfe["test-files-exist"].pass, true, mixExUnitOverJsTfe["test-files-exist"].message);
assert.equal(mixExUnitOverJsTfe["test-files-exist"].message.includes("Found 2 test file(s)"), true);
assert.match(mixExUnitOverJsTfe["test-files-exist"].message, /foo_test\.exs/);
assert.equal(
  /foo\.test\.js/.test(mixExUnitOverJsTfe["test-files-exist"].message),
  false,
  mixExUnitOverJsTfe["test-files-exist"].message,
);
assert.match(mixExUnitOverJsTfe["test-files-exist"].details, /^test\/foo_test\.exs\b/);
assert.match(mixExUnitOverJsTfe["test-files-exist"].details, /foo\.test\.js/);

const mixJsOnlyTfe = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(mixJsOnlyTfe["test-files-exist"].pass, true, mixJsOnlyTfe["test-files-exist"].message);
assert.match(mixJsOnlyTfe["test-files-exist"].message, /foo\.test\.js/);

const mixExUnitOverSpecTs = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "test/foo_test.exs": "defmodule FooTest do\nend\n",
  "assets/foo.spec.ts": "test('ok');\n",
});
assert.equal(mixExUnitOverSpecTs["test-files-exist"].pass, true, mixExUnitOverSpecTs["test-files-exist"].message);
assert.match(mixExUnitOverSpecTs["test-files-exist"].message, /foo_test\.exs/);
assert.equal(
  /foo\.spec\.ts/.test(mixExUnitOverSpecTs["test-files-exist"].message),
  false,
  mixExUnitOverSpecTs["test-files-exist"].message,
);

const mixExUnitOverSameDirJs = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "test/foo_test.exs": "defmodule FooTest do\nend\n",
  "test/foo.test.js": "test('ok');\n",
});
assert.equal(
  mixExUnitOverSameDirJs["test-files-exist"].pass,
  true,
  mixExUnitOverSameDirJs["test-files-exist"].message,
);
assert.match(mixExUnitOverSameDirJs["test-files-exist"].message, /foo_test\.exs/);
assert.equal(
  /foo\.test\.js/.test(mixExUnitOverSameDirJs["test-files-exist"].message),
  false,
  mixExUnitOverSameDirJs["test-files-exist"].message,
);

const packageJsonTsOverGoTfe = evalTree({
  "package.json": { name: "demo" },
  "foo.test.ts": "test('ok');\n",
  "plugin_test.go": "package plugin\n",
});
assert.equal(
  packageJsonTsOverGoTfe["test-files-exist"].pass,
  true,
  packageJsonTsOverGoTfe["test-files-exist"].message,
);
assert.match(packageJsonTsOverGoTfe["test-files-exist"].message, /foo\.test\.ts/);
assert.equal(
  /plugin_test\.go/.test(packageJsonTsOverGoTfe["test-files-exist"].message),
  false,
  packageJsonTsOverGoTfe["test-files-exist"].message,
);

const railsSpecOverJsTfe = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  "test/foo_spec.rb": "RSpec.describe Foo do\nend\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(railsSpecOverJsTfe["test-files-exist"].pass, true, railsSpecOverJsTfe["test-files-exist"].message);
assert.equal(railsSpecOverJsTfe["test-files-exist"].message.includes("Found 2 test file(s)"), true);
assert.match(railsSpecOverJsTfe["test-files-exist"].message, /foo_spec\.rb/);
assert.equal(
  /foo\.test\.js/.test(railsSpecOverJsTfe["test-files-exist"].message),
  false,
  railsSpecOverJsTfe["test-files-exist"].message,
);
assert.match(railsSpecOverJsTfe["test-files-exist"].details, /^test\/foo_spec\.rb\b/);
assert.match(railsSpecOverJsTfe["test-files-exist"].details, /foo\.test\.js/);

const railsJsOnlyTfe = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(railsJsOnlyTfe["test-files-exist"].pass, true, railsJsOnlyTfe["test-files-exist"].message);
assert.match(railsJsOnlyTfe["test-files-exist"].message, /foo\.test\.js/);

const railsSpecOverSpecTs = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  "test/foo_spec.rb": "RSpec.describe Foo do\nend\n",
  "assets/foo.spec.ts": "test('ok');\n",
});
assert.equal(railsSpecOverSpecTs["test-files-exist"].pass, true, railsSpecOverSpecTs["test-files-exist"].message);
assert.match(railsSpecOverSpecTs["test-files-exist"].message, /foo_spec\.rb/);
assert.equal(
  /foo\.spec\.ts/.test(railsSpecOverSpecTs["test-files-exist"].message),
  false,
  railsSpecOverSpecTs["test-files-exist"].message,
);

const railsTestOverSameDirJs = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  "test/foo_test.rb": "class FooTest < Minitest::Test\nend\n",
  "test/foo.test.js": "test('ok');\n",
});
assert.equal(
  railsTestOverSameDirJs["test-files-exist"].pass,
  true,
  railsTestOverSameDirJs["test-files-exist"].message,
);
assert.match(railsTestOverSameDirJs["test-files-exist"].message, /foo_test\.rb/);
assert.equal(
  /foo\.test\.js/.test(railsTestOverSameDirJs["test-files-exist"].message),
  false,
  railsTestOverSameDirJs["test-files-exist"].message,
);

const pyPytestOverJsTfe = evalTree({
  "pyproject.toml": "[project]\nname = \"demo\"\n",
  "tests/test_foo.py": "def test_ok():\n    assert True\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(pyPytestOverJsTfe["test-files-exist"].pass, true, pyPytestOverJsTfe["test-files-exist"].message);
assert.equal(pyPytestOverJsTfe["test-files-exist"].message.includes("Found 2 test file(s)"), true);
assert.match(pyPytestOverJsTfe["test-files-exist"].message, /test_foo\.py/);
assert.equal(
  /foo\.test\.js/.test(pyPytestOverJsTfe["test-files-exist"].message),
  false,
  pyPytestOverJsTfe["test-files-exist"].message,
);
assert.match(pyPytestOverJsTfe["test-files-exist"].details, /^tests\/test_foo\.py\b/);
assert.match(pyPytestOverJsTfe["test-files-exist"].details, /foo\.test\.js/);

const pyJsOnlyTfe = evalTree({
  "pyproject.toml": "[project]\nname = \"demo\"\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(pyJsOnlyTfe["test-files-exist"].pass, true, pyJsOnlyTfe["test-files-exist"].message);
assert.match(pyJsOnlyTfe["test-files-exist"].message, /foo\.test\.js/);

const setupPyOverJsTfe = evalTree({
  "setup.py": "from setuptools import setup\nsetup(name='demo')\n",
  "tests/test_foo.py": "def test_ok():\n    assert True\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(setupPyOverJsTfe["test-files-exist"].pass, true, setupPyOverJsTfe["test-files-exist"].message);
assert.match(setupPyOverJsTfe["test-files-exist"].message, /test_foo\.py/);
assert.equal(
  /foo\.test\.js/.test(setupPyOverJsTfe["test-files-exist"].message),
  false,
  setupPyOverJsTfe["test-files-exist"].message,
);

const setupCfgOverJsTfe = evalTree({
  "setup.cfg": "[metadata]\nname = demo\n",
  "pkg/foo_test.py": "def test_ok():\n    assert True\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(setupCfgOverJsTfe["test-files-exist"].pass, true, setupCfgOverJsTfe["test-files-exist"].message);
assert.match(setupCfgOverJsTfe["test-files-exist"].message, /foo_test\.py/);
assert.equal(
  /foo\.test\.js/.test(setupCfgOverJsTfe["test-files-exist"].message),
  false,
  setupCfgOverJsTfe["test-files-exist"].message,
);

const pyPytestOverSpecTs = evalTree({
  "pyproject.toml": "[project]\nname = \"demo\"\n",
  "tests/test_foo.py": "def test_ok():\n    assert True\n",
  "assets/foo.spec.ts": "test('ok');\n",
});
assert.equal(pyPytestOverSpecTs["test-files-exist"].pass, true, pyPytestOverSpecTs["test-files-exist"].message);
assert.match(pyPytestOverSpecTs["test-files-exist"].message, /test_foo\.py/);
assert.equal(
  /foo\.spec\.ts/.test(pyPytestOverSpecTs["test-files-exist"].message),
  false,
  pyPytestOverSpecTs["test-files-exist"].message,
);

const pyPytestOverSameDirJs = evalTree({
  "pyproject.toml": "[project]\nname = \"demo\"\n",
  "tests/test_foo.py": "def test_ok():\n    assert True\n",
  "tests/foo.test.js": "test('ok');\n",
});
assert.equal(
  pyPytestOverSameDirJs["test-files-exist"].pass,
  true,
  pyPytestOverSameDirJs["test-files-exist"].message,
);
assert.match(pyPytestOverSameDirJs["test-files-exist"].message, /test_foo\.py/);
assert.equal(
  /foo\.test\.js/.test(pyPytestOverSameDirJs["test-files-exist"].message),
  false,
  pyPytestOverSameDirJs["test-files-exist"].message,
);

const javaTestOverJsTfe = evalTree({
  "pom.xml": "<project></project>\n",
  "src/test/java/FooTest.java": "class FooTest {}\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(javaTestOverJsTfe["test-files-exist"].pass, true, javaTestOverJsTfe["test-files-exist"].message);
assert.equal(javaTestOverJsTfe["test-files-exist"].message.includes("Found 2 test file(s)"), true);
assert.match(javaTestOverJsTfe["test-files-exist"].message, /FooTest\.java/);
assert.equal(
  /foo\.test\.js/.test(javaTestOverJsTfe["test-files-exist"].message),
  false,
  javaTestOverJsTfe["test-files-exist"].message,
);
assert.match(javaTestOverJsTfe["test-files-exist"].details, /^src\/test\/java\/FooTest\.java\b/);
assert.match(javaTestOverJsTfe["test-files-exist"].details, /foo\.test\.js/);

const javaJsOnlyTfe = evalTree({
  "pom.xml": "<project></project>\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(javaJsOnlyTfe["test-files-exist"].pass, true, javaJsOnlyTfe["test-files-exist"].message);
assert.match(javaJsOnlyTfe["test-files-exist"].message, /foo\.test\.js/);

const gradleTestOverJsTfe = evalTree({
  "build.gradle": "plugins { java }\n",
  "src/test/java/FooTest.java": "class FooTest {}\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(gradleTestOverJsTfe["test-files-exist"].pass, true, gradleTestOverJsTfe["test-files-exist"].message);
assert.match(gradleTestOverJsTfe["test-files-exist"].message, /FooTest\.java/);
assert.equal(
  /foo\.test\.js/.test(gradleTestOverJsTfe["test-files-exist"].message),
  false,
  gradleTestOverJsTfe["test-files-exist"].message,
);

const gradleKtsTestsOverJsTfe = evalTree({
  "build.gradle.kts": "plugins { java }\n",
  "src/test/java/FooTests.java": "class FooTests {}\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(
  gradleKtsTestsOverJsTfe["test-files-exist"].pass,
  true,
  gradleKtsTestsOverJsTfe["test-files-exist"].message,
);
assert.match(gradleKtsTestsOverJsTfe["test-files-exist"].message, /FooTests\.java/);
assert.equal(
  /foo\.test\.js/.test(gradleKtsTestsOverJsTfe["test-files-exist"].message),
  false,
  gradleKtsTestsOverJsTfe["test-files-exist"].message,
);

const javaTestOverSpecTs = evalTree({
  "pom.xml": "<project></project>\n",
  "src/test/java/FooTest.java": "class FooTest {}\n",
  "assets/foo.spec.ts": "test('ok');\n",
});
assert.equal(javaTestOverSpecTs["test-files-exist"].pass, true, javaTestOverSpecTs["test-files-exist"].message);
assert.match(javaTestOverSpecTs["test-files-exist"].message, /FooTest\.java/);
assert.equal(
  /foo\.spec\.ts/.test(javaTestOverSpecTs["test-files-exist"].message),
  false,
  javaTestOverSpecTs["test-files-exist"].message,
);

const javaTestOverTestTs = evalTree({
  "pom.xml": "<project></project>\n",
  "src/test/java/FooTest.java": "class FooTest {}\n",
  "assets/foo.test.ts": "test('ok');\n",
});
assert.equal(javaTestOverTestTs["test-files-exist"].pass, true, javaTestOverTestTs["test-files-exist"].message);
assert.match(javaTestOverTestTs["test-files-exist"].message, /FooTest\.java/);
assert.equal(
  /foo\.test\.ts/.test(javaTestOverTestTs["test-files-exist"].message),
  false,
  javaTestOverTestTs["test-files-exist"].message,
);

const javaTestOverSameDirJs = evalTree({
  "pom.xml": "<project></project>\n",
  "src/test/java/FooTest.java": "class FooTest {}\n",
  "src/test/java/foo.test.js": "test('ok');\n",
});
assert.equal(
  javaTestOverSameDirJs["test-files-exist"].pass,
  true,
  javaTestOverSameDirJs["test-files-exist"].message,
);
assert.match(javaTestOverSameDirJs["test-files-exist"].message, /FooTest\.java/);
assert.equal(
  /foo\.test\.js/.test(javaTestOverSameDirJs["test-files-exist"].message),
  false,
  javaTestOverSameDirJs["test-files-exist"].message,
);

const javaTestOverShallowJs = evalTree({
  "pom.xml": "<project></project>\n",
  "src/test/java/FooTest.java": "class FooTest {}\n",
  "test/foo.test.js": "test('ok');\n",
});
assert.equal(
  javaTestOverShallowJs["test-files-exist"].pass,
  true,
  javaTestOverShallowJs["test-files-exist"].message,
);
assert.match(javaTestOverShallowJs["test-files-exist"].message, /FooTest\.java/);
assert.equal(
  /foo\.test\.js/.test(javaTestOverShallowJs["test-files-exist"].message),
  false,
  javaTestOverShallowJs["test-files-exist"].message,
);

const csharpTestsOverJsTfe = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "FooTests.cs": "class FooTests {}\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(csharpTestsOverJsTfe["test-files-exist"].pass, true, csharpTestsOverJsTfe["test-files-exist"].message);
assert.equal(csharpTestsOverJsTfe["test-files-exist"].message.includes("Found 2 test file(s)"), true);
assert.match(csharpTestsOverJsTfe["test-files-exist"].message, /FooTests\.cs/);
assert.equal(
  /foo\.test\.js/.test(csharpTestsOverJsTfe["test-files-exist"].message),
  false,
  csharpTestsOverJsTfe["test-files-exist"].message,
);
assert.match(csharpTestsOverJsTfe["test-files-exist"].details, /^FooTests\.cs\b/);
assert.match(csharpTestsOverJsTfe["test-files-exist"].details, /foo\.test\.js/);

const csharpJsOnlyTfe = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(csharpJsOnlyTfe["test-files-exist"].pass, true, csharpJsOnlyTfe["test-files-exist"].message);
assert.match(csharpJsOnlyTfe["test-files-exist"].message, /foo\.test\.js/);

const csharpTestOverJsTfe = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "FooTest.cs": "class FooTest {}\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(csharpTestOverJsTfe["test-files-exist"].pass, true, csharpTestOverJsTfe["test-files-exist"].message);
assert.match(csharpTestOverJsTfe["test-files-exist"].message, /FooTest\.cs/);
assert.equal(
  /foo\.test\.js/.test(csharpTestOverJsTfe["test-files-exist"].message),
  false,
  csharpTestOverJsTfe["test-files-exist"].message,
);

const slnTestsOverJsTfe = evalTree({
  "Foo.sln": "Microsoft Visual Studio Solution\n",
  "FooTests.cs": "class FooTests {}\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(slnTestsOverJsTfe["test-files-exist"].pass, true, slnTestsOverJsTfe["test-files-exist"].message);
assert.match(slnTestsOverJsTfe["test-files-exist"].message, /FooTests\.cs/);
assert.equal(
  /foo\.test\.js/.test(slnTestsOverJsTfe["test-files-exist"].message),
  false,
  slnTestsOverJsTfe["test-files-exist"].message,
);

const csharpTestsOverSpecTs = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "FooTests.cs": "class FooTests {}\n",
  "assets/foo.spec.ts": "test('ok');\n",
});
assert.equal(csharpTestsOverSpecTs["test-files-exist"].pass, true, csharpTestsOverSpecTs["test-files-exist"].message);
assert.match(csharpTestsOverSpecTs["test-files-exist"].message, /FooTests\.cs/);
assert.equal(
  /foo\.spec\.ts/.test(csharpTestsOverSpecTs["test-files-exist"].message),
  false,
  csharpTestsOverSpecTs["test-files-exist"].message,
);

const csharpTestsOverTestTs = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "FooTests.cs": "class FooTests {}\n",
  "assets/foo.test.ts": "test('ok');\n",
});
assert.equal(csharpTestsOverTestTs["test-files-exist"].pass, true, csharpTestsOverTestTs["test-files-exist"].message);
assert.match(csharpTestsOverTestTs["test-files-exist"].message, /FooTests\.cs/);
assert.equal(
  /foo\.test\.ts/.test(csharpTestsOverTestTs["test-files-exist"].message),
  false,
  csharpTestsOverTestTs["test-files-exist"].message,
);

const csharpTestsOverSameDirJs = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "FooTests.cs": "class FooTests {}\n",
  "foo.test.js": "test('ok');\n",
});
assert.equal(
  csharpTestsOverSameDirJs["test-files-exist"].pass,
  true,
  csharpTestsOverSameDirJs["test-files-exist"].message,
);
assert.match(csharpTestsOverSameDirJs["test-files-exist"].message, /FooTests\.cs/);
assert.equal(
  /foo\.test\.js/.test(csharpTestsOverSameDirJs["test-files-exist"].message),
  false,
  csharpTestsOverSameDirJs["test-files-exist"].message,
);

const csharpTestsOverShallowJs = evalTree({
  "Src/Foo/Foo.csproj": "<Project></Project>\n",
  "Src/Foo.Tests/FooTests.cs": "class FooTests {}\n",
  "test/foo.test.js": "test('ok');\n",
});
assert.equal(
  csharpTestsOverShallowJs["test-files-exist"].pass,
  true,
  csharpTestsOverShallowJs["test-files-exist"].message,
);
assert.match(csharpTestsOverShallowJs["test-files-exist"].message, /FooTests\.cs/);
assert.equal(
  /foo\.test\.js/.test(csharpTestsOverShallowJs["test-files-exist"].message),
  false,
  csharpTestsOverShallowJs["test-files-exist"].message,
);

const csharpFuzzDeferTfe = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "FooFuzzTests.cs": "class FooFuzzTests {}\n",
  "FooTests.cs": "class FooTests {}\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(csharpFuzzDeferTfe["test-files-exist"].pass, true, csharpFuzzDeferTfe["test-files-exist"].message);
assert.equal(csharpFuzzDeferTfe["test-files-exist"].message.includes("Found 3 test file(s)"), true);
assert.match(csharpFuzzDeferTfe["test-files-exist"].message, /FooTests\.cs/);
assert.equal(
  /FuzzTests/.test(csharpFuzzDeferTfe["test-files-exist"].message),
  false,
  csharpFuzzDeferTfe["test-files-exist"].message,
);
assert.equal(
  /foo\.test\.js/.test(csharpFuzzDeferTfe["test-files-exist"].message),
  false,
  csharpFuzzDeferTfe["test-files-exist"].message,
);

const csharpBenchDeferTfe = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "FooBenchmarkTests.cs": "class FooBenchmarkTests {}\n",
  "FooTests.cs": "class FooTests {}\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(csharpBenchDeferTfe["test-files-exist"].pass, true, csharpBenchDeferTfe["test-files-exist"].message);
assert.match(csharpBenchDeferTfe["test-files-exist"].message, /FooTests\.cs/);
assert.equal(/Benchmark/.test(csharpBenchDeferTfe["test-files-exist"].message), false);

const csharpFuzzOnlyTfe = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "FooFuzzTests.cs": "class FooFuzzTests {}\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(csharpFuzzOnlyTfe["test-files-exist"].pass, true, csharpFuzzOnlyTfe["test-files-exist"].message);
assert.match(csharpFuzzOnlyTfe["test-files-exist"].message, /FooFuzzTests\.cs/);

const csharpBenchPathDefer = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "tests/FooTests.cs": "class FooTests {}\n",
  "benchmarks/LegacyTests.cs": "class LegacyTests {}\n",
});
assert.equal(
  csharpBenchPathDefer["test-framework"].pass,
  true,
  csharpBenchPathDefer["test-framework"].message,
);
assert.match(csharpBenchPathDefer["test-framework"].message, /FooTests\.cs/);
assert.equal(
  /LegacyTests/.test(csharpBenchPathDefer["test-framework"].message),
  false,
  csharpBenchPathDefer["test-framework"].message,
);
assert.equal(
  csharpBenchPathDefer["test-files-exist"].pass,
  true,
  csharpBenchPathDefer["test-files-exist"].message,
);
assert.match(csharpBenchPathDefer["test-files-exist"].message, /FooTests\.cs/);
assert.equal(
  /LegacyTests/.test(csharpBenchPathDefer["test-files-exist"].message),
  false,
  csharpBenchPathDefer["test-files-exist"].message,
);
const csharpBenchPathCase = evalTree({
  "Foo.csproj": "<Project></Project>\n",
  "tests/FooTests.cs": "class FooTests {}\n",
  "Benchmarks/LegacyTests.cs": "class LegacyTests {}\n",
});
assert.equal(
  csharpBenchPathCase["test-framework"].pass,
  true,
  csharpBenchPathCase["test-framework"].message,
);
assert.match(csharpBenchPathCase["test-framework"].message, /FooTests\.cs/);
assert.equal(
  /LegacyTests/.test(csharpBenchPathCase["test-framework"].message),
  false,
  csharpBenchPathCase["test-framework"].message,
);
const csharpBenchPathOnly = evalTree({
  "benchmarks/LegacyTests.cs": "class LegacyTests {}\n",
});
assert.equal(
  csharpBenchPathOnly["test-framework"].pass,
  true,
  csharpBenchPathOnly["test-framework"].message,
);
assert.match(csharpBenchPathOnly["test-framework"].message, /LegacyTests\.cs/);
assert.equal(
  csharpBenchPathOnly["test-files-exist"].pass,
  true,
  csharpBenchPathOnly["test-files-exist"].message,
);
assert.match(csharpBenchPathOnly["test-files-exist"].message, /LegacyTests\.cs/);
const mixExUnitStillNamesExs = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "test/foo_test.exs": "defmodule FooTest do\nend\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  mixExUnitStillNamesExs["test-framework"].pass,
  true,
  mixExUnitStillNamesExs["test-framework"].message,
);
assert.match(mixExUnitStillNamesExs["test-framework"].message, /foo_test\.exs/);
assert.equal(
  /jest\.config/.test(mixExUnitStillNamesExs["test-framework"].message),
  false,
  mixExUnitStillNamesExs["test-framework"].message,
);
const javaFixturesDefer = evalTree({
  "pom.xml": "<project></project>\n",
  "src/test/java/FooTest.java": "class FooTest {}\n",
  "src/test/java/fixtures/OneMillionTests.java": "class OneMillionTests {}\n",
});
assert.equal(
  javaFixturesDefer["test-framework"].pass,
  true,
  javaFixturesDefer["test-framework"].message,
);
assert.match(javaFixturesDefer["test-framework"].message, /FooTest\.java/);
assert.equal(
  /OneMillionTests/.test(javaFixturesDefer["test-framework"].message),
  false,
  javaFixturesDefer["test-framework"].message,
);
assert.equal(
  javaFixturesDefer["test-files-exist"].pass,
  true,
  javaFixturesDefer["test-files-exist"].message,
);
assert.match(javaFixturesDefer["test-files-exist"].message, /FooTest\.java/);
assert.equal(
  /OneMillionTests/.test(javaFixturesDefer["test-files-exist"].message),
  false,
  javaFixturesDefer["test-files-exist"].message,
);

function assertJavaFirstHit(files, needle, opts = {}) {
  const byId = evalTree(files);
  for (const id of ["test-framework", "test-files-exist"]) {
    assert.equal(byId[id].pass, true, `${id} should pass: ${byId[id].message}`);
    assert.match(byId[id].message, needle, `${id}: ${byId[id].message}`);
    if (opts.not) {
      assert.equal(opts.not.test(byId[id].message), false, `${id}: ${byId[id].message}`);
    }
  }
  return byId;
}

const javaSrcTestOverMain = assertJavaFirstHit(
  {
    "pom.xml": "<project></project>\n",
    "src/test/java/FooTest.java": "class FooTest {}\n",
    "src/main/java/DynamicTest.java": "class DynamicTest {}\n",
  },
  /FooTest\.java/,
  { not: /DynamicTest/ },
);
assert.equal(javaSrcTestOverMain["test-files-exist"].message.includes("Found 2 test file(s)"), true);

const javaSrcTestOverTestlib = assertJavaFirstHit(
  {
    "pom.xml": "<project></project>\n",
    "src/test/java/FooTest.java": "class FooTest {}\n",
    "foo-testlib/src/AbstractTests.java": "class AbstractTests {}\n",
  },
  /FooTest\.java/,
  { not: /AbstractTests/ },
);
assert.match(javaSrcTestOverTestlib["test-files-exist"].details, /^src\/test\/java\/FooTest\.java\b/);

const javaSrcTestOverMock = assertJavaFirstHit(
  {
    "pom.xml": "<project></project>\n",
    "src/test/java/FooTest.java": "class FooTest {}\n",
    "mock/src/test/java/MockTest.java": "class MockTest {}\n",
  },
  /FooTest\.java/,
  { not: /MockTest/ },
);
const javaSrcTestOverMocks = assertJavaFirstHit(
  {
    "pom.xml": "<project></project>\n",
    "src/test/java/FooTest.java": "class FooTest {}\n",
    "mocks/MockTest.java": "class MockTest {}\n",
  },
  /FooTest\.java/,
  { not: /MockTest/ },
);
assert.equal(javaSrcTestOverMocks["test-files-exist"].pass, true);

const javaSrcTestOverPy = assertJavaFirstHit(
  {
    "pom.xml": "<project></project>\n",
    "src/test/java/FooTest.java": "class FooTest {}\n",
    "docker/docker_build_test.py": "def test_ok():\n    assert True\n",
  },
  /FooTest\.java/,
  { not: /docker_build_test/ },
);
assert.equal(javaSrcTestOverPy["test-files-exist"].message.includes("Found 2 test file(s)"), true);
assert.match(javaSrcTestOverPy["test-files-exist"].details, /docker_build_test\.py/);

const javaTestlibOnly = evalTree({
  "foo-testlib/src/AbstractTests.java": "class AbstractTests {}\n",
});
assert.equal(javaTestlibOnly["test-framework"].pass, true, javaTestlibOnly["test-framework"].message);
assert.match(javaTestlibOnly["test-framework"].message, /AbstractTests\.java/);
assert.equal(javaTestlibOnly["test-files-exist"].pass, true, javaTestlibOnly["test-files-exist"].message);
assert.match(javaTestlibOnly["test-files-exist"].message, /AbstractTests\.java/);

const javaMainOnly = evalTree({
  "pom.xml": "<project></project>\n",
  "src/main/java/DynamicTest.java": "class DynamicTest {}\n",
});
assert.equal(javaMainOnly["test-framework"].pass, true, javaMainOnly["test-framework"].message);
assert.match(javaMainOnly["test-framework"].message, /DynamicTest\.java/);
assert.equal(javaMainOnly["test-files-exist"].pass, true, javaMainOnly["test-files-exist"].message);
assert.match(javaMainOnly["test-files-exist"].message, /DynamicTest\.java/);

const javaPyOnly = evalTree({
  "pom.xml": "<project></project>\n",
  "docker/docker_build_test.py": "def test_ok():\n    assert True\n",
});
assert.equal(javaPyOnly["test-framework"].pass, true, javaPyOnly["test-framework"].message);
assert.match(javaPyOnly["test-framework"].message, /docker_build_test\.py/);
assert.equal(javaPyOnly["test-files-exist"].pass, true, javaPyOnly["test-files-exist"].message);
assert.match(javaPyOnly["test-files-exist"].message, /docker_build_test\.py/);

const javaSrcTestOverIntegration = assertJavaFirstHit(
  {
    "pom.xml": "<project></project>\n",
    "src/test/java/FooTest.java": "class FooTest {}\n",
    "foo-integration-tests/src/test/java/ITTest.java": "class ITTest {}\n",
  },
  /FooTest\.java/,
  { not: /ITTest/ },
);
assert.equal(javaSrcTestOverIntegration["test-files-exist"].pass, true);

const javaSrcTestOverSupport = assertJavaFirstHit(
  {
    "pom.xml": "<project></project>\n",
    "src/test/java/FooTest.java": "class FooTest {}\n",
    "support/SupportTest.java": "class SupportTest {}\n",
  },
  /FooTest\.java/,
  { not: /SupportTest/ },
);
assert.equal(javaSrcTestOverSupport["test-files-exist"].pass, true);

const javaJvmTestOverSatellite = assertJavaFirstHit(
  {
    "build.gradle": "plugins { java }\n",
    "foo/src/jvmTest/java/FooTest.java": "class FooTest {}\n",
    "foo-tls/src/test/java/TlsTest.java": "class TlsTest {}\n",
  },
  /FooTest\.java/,
  { not: /TlsTest/ },
);
assert.match(
  javaJvmTestOverSatellite["test-files-exist"].details,
  /^foo\/src\/jvmTest\/java\/FooTest\.java\b/,
);

const javaJvmTestOverMain = assertJavaFirstHit(
  {
    "pom.xml": "<project></project>\n",
    "src/jvmTest/java/FooTest.java": "class FooTest {}\n",
    "src/main/java/DynamicTest.java": "class DynamicTest {}\n",
  },
  /FooTest\.java/,
  { not: /DynamicTest/ },
);
assert.equal(javaJvmTestOverMain["test-files-exist"].message.includes("Found 2 test file(s)"), true);

const javaJvmTestOnly = evalTree({
  "build.gradle": "plugins { java }\n",
  "src/jvmTest/java/FooTest.java": "class FooTest {}\n",
});
assert.equal(javaJvmTestOnly["test-framework"].pass, true, javaJvmTestOnly["test-framework"].message);
assert.match(javaJvmTestOnly["test-framework"].message, /FooTest\.java/);
assert.equal(javaJvmTestOnly["test-files-exist"].pass, true, javaJvmTestOnly["test-files-exist"].message);
assert.match(javaJvmTestOnly["test-files-exist"].message, /jvmTest/);

const javaSatelliteSrcTestOnly = evalTree({
  "build.gradle": "plugins { java }\n",
  "foo-tls/src/test/java/TlsTest.java": "class TlsTest {}\n",
});
assert.equal(
  javaSatelliteSrcTestOnly["test-framework"].pass,
  true,
  javaSatelliteSrcTestOnly["test-framework"].message,
);
assert.match(javaSatelliteSrcTestOnly["test-framework"].message, /TlsTest\.java/);
assert.equal(
  javaSatelliteSrcTestOnly["test-files-exist"].pass,
  true,
  javaSatelliteSrcTestOnly["test-files-exist"].message,
);
assert.match(javaSatelliteSrcTestOnly["test-files-exist"].message, /TlsTest\.java/);

const javaAndroidTestOverSatellite = assertJavaFirstHit(
  {
    "build.gradle": "plugins { java }\n",
    "foo/src/androidTest/java/FooTest.java": "class FooTest {}\n",
    "foo-tls/src/test/java/TlsTest.java": "class TlsTest {}\n",
  },
  /FooTest\.java/,
  { not: /TlsTest/ },
);
assert.equal(javaAndroidTestOverSatellite["test-framework"].pass, true);

const javaAndroidUnitTestOverSatellite = assertJavaFirstHit(
  {
    "build.gradle": "plugins { java }\n",
    "foo/src/androidUnitTest/java/FooTest.java": "class FooTest {}\n",
    "foo-tls/src/test/java/TlsTest.java": "class TlsTest {}\n",
  },
  /FooTest\.java/,
  { not: /TlsTest/ },
);
assert.equal(javaAndroidUnitTestOverSatellite["test-framework"].pass, true);

const javaCommonTestOverSatellite = assertJavaFirstHit(
  {
    "build.gradle": "plugins { java }\n",
    "foo/src/commonTest/java/FooTest.java": "class FooTest {}\n",
    "foo-tls/src/test/java/TlsTest.java": "class TlsTest {}\n",
  },
  /FooTest\.java/,
  { not: /TlsTest/ },
);
assert.equal(javaCommonTestOverSatellite["test-framework"].pass, true);

const kotlinJvmTestOverSatellite = evalTree({
  "build.gradle": "plugins { java }\n",
  "foo/src/jvmTest/kotlin/FooTest.kt": "class FooTest\n",
  "foo-tls/src/test/java/TlsTest.java": "class TlsTest {}\n",
});
assert.equal(
  kotlinJvmTestOverSatellite["test-files-exist"].pass,
  true,
  kotlinJvmTestOverSatellite["test-files-exist"].message,
);
assert.match(kotlinJvmTestOverSatellite["test-files-exist"].message, /FooTest\.kt/);
assert.equal(
  /TlsTest/.test(kotlinJvmTestOverSatellite["test-files-exist"].message),
  false,
  kotlinJvmTestOverSatellite["test-files-exist"].message,
);

const javaSrcTestOverTestlibCase = assertJavaFirstHit(
  {
    "build.gradle": "plugins { java }\n",
    "src/test/java/FooTest.java": "class FooTest {}\n",
    "foo-TestLib/src/AbstractTests.java": "class AbstractTests {}\n",
  },
  /FooTest\.java/,
  { not: /AbstractTests/ },
);
assert.equal(javaSrcTestOverTestlibCase["test-framework"].pass, true);

function assertTfeFirstHit(files, needle, opts = {}) {
  const byId = evalTree(files);
  assert.equal(
    byId["test-files-exist"].pass,
    true,
    `test-files-exist should pass: ${byId["test-files-exist"].message}`,
  );
  assert.match(
    byId["test-files-exist"].message,
    needle,
    `test-files-exist: ${byId["test-files-exist"].message}`,
  );
  if (opts.not) {
    assert.equal(
      opts.not.test(byId["test-files-exist"].message),
      false,
      `test-files-exist: ${byId["test-files-exist"].message}`,
    );
  }
  return byId;
}

const packagesTestOverIntegrationE2e = assertTfeFirstHit(
  {
    "packages/foo/test/foo.spec.ts": "test('ok', () => {});\n",
    "integration/cors/e2e/express.spec.ts": "test('cors', () => {});\n",
  },
  /packages\/foo\/test\/foo\.spec\.ts/,
  { not: /integration|express\.spec/ },
);
assert.equal(
  packagesTestOverIntegrationE2e["test-files-exist"].message.includes("Found 2 test file(s)"),
  true,
);

const packagesTestOverIntegrationAutoMock = assertTfeFirstHit(
  {
    "packages/foo/test/foo.spec.ts": "test('ok', () => {});\n",
    "integration/auto-mock/test/bar.spec.ts": "test('auto', () => {});\n",
  },
  /packages\/foo\/test\/foo\.spec\.ts/,
  { not: /auto-mock|bar\.spec/ },
);
assert.equal(
  packagesTestOverIntegrationAutoMock["test-files-exist"].message.includes("Found 2 test file(s)"),
  true,
);

const packagesSpecOverIntegration = assertTfeFirstHit(
  {
    "packages/foo/src/foo.spec.ts": "test('ok', () => {});\n",
    "integration/cors/e2e/express.spec.ts": "test('cors', () => {});\n",
  },
  /packages\/foo\/src\/foo\.spec\.ts/,
  { not: /integration|express\.spec/ },
);
assert.equal(packagesSpecOverIntegration["test-files-exist"].pass, true);

const packagesTestOverE2e = assertTfeFirstHit(
  {
    "packages/foo/test/foo.spec.ts": "test('ok', () => {});\n",
    "e2e/express.spec.ts": "test('e2e', () => {});\n",
  },
  /packages\/foo\/test\/foo\.spec\.ts/,
  { not: /e2e\/express/ },
);
assert.equal(packagesTestOverE2e["test-files-exist"].pass, true);

const integrationOnlyStillPasses = assertTfeFirstHit(
  {
    "integration/cors/e2e/express.spec.ts": "test('cors', () => {});\n",
  },
  /integration\/cors\/e2e\/express\.spec\.ts/,
);
assert.equal(integrationOnlyStillPasses["test-files-exist"].pass, true);

const e2eOnlyStillPasses = assertTfeFirstHit(
  {
    "e2e/express.spec.ts": "test('e2e', () => {});\n",
  },
  /e2e\/express\.spec\.ts/,
);
assert.equal(e2eOnlyStillPasses["test-files-exist"].pass, true);

const autoMockNotLetterSuffix = assertTfeFirstHit(
  {
    "packages/foo/test/foo.spec.ts": "test('ok', () => {});\n",
    "auto-mock/test/bar.spec.ts": "test('auto', () => {});\n",
  },
  /auto-mock\/test\/bar\.spec\.ts/,
  { not: /packages\/foo/ },
);
assert.equal(autoMockNotLetterSuffix["test-files-exist"].pass, true);

const exactMockStillDeferred = assertTfeFirstHit(
  {
    "packages/foo/test/foo.spec.ts": "test('ok', () => {});\n",
    "mock/test/bar.spec.ts": "test('mock', () => {});\n",
  },
  /packages\/foo\/test\/foo\.spec\.ts/,
  { not: /mock\/test|bar\.spec/ },
);
assert.equal(exactMockStillDeferred["test-files-exist"].pass, true);

const letterSuffixMockNotDeferred = assertTfeFirstHit(
  {
    "packages/foo/test/foo.spec.ts": "test('ok', () => {});\n",
    "automock/test/bar.spec.ts": "test('auto', () => {});\n",
  },
  /automock\/test\/bar\.spec\.ts/,
  { not: /packages\/foo/ },
);
assert.equal(letterSuffixMockNotDeferred["test-files-exist"].pass, true);

const mixExUnitStillNamesExsAfterJavaRank = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "test/foo_test.exs": "defmodule FooTest do\nend\n",
});
assert.equal(
  mixExUnitStillNamesExsAfterJavaRank["test-framework"].pass,
  true,
  mixExUnitStillNamesExsAfterJavaRank["test-framework"].message,
);
assert.match(mixExUnitStillNamesExsAfterJavaRank["test-framework"].message, /foo_test\.exs/);
assert.equal(
  mixExUnitStillNamesExsAfterJavaRank["test-files-exist"].pass,
  true,
  mixExUnitStillNamesExsAfterJavaRank["test-files-exist"].message,
);
assert.match(mixExUnitStillNamesExsAfterJavaRank["test-files-exist"].message, /foo_test\.exs/);

const mixExUnitOverJestTfe = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "test/foo_test.exs": "defmodule FooTest do\nend\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  mixExUnitOverJestTfe["test-framework"].pass,
  true,
  mixExUnitOverJestTfe["test-framework"].message,
);
assert.match(mixExUnitOverJestTfe["test-framework"].message, /foo_test\.exs/);
assert.equal(
  /jest\.config/.test(mixExUnitOverJestTfe["test-framework"].message),
  false,
  mixExUnitOverJestTfe["test-framework"].message,
);
const railsSpecOverJestFramework = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  "spec/foo_spec.rb": "RSpec.describe Foo do\nend\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  railsSpecOverJestFramework["test-framework"].pass,
  true,
  railsSpecOverJestFramework["test-framework"].message,
);
assert.match(
  railsSpecOverJestFramework["test-framework"].message,
  /foo_spec\.rb|spec_helper/,
);
assert.equal(
  /jest\.config/.test(railsSpecOverJestFramework["test-framework"].message),
  false,
  railsSpecOverJestFramework["test-framework"].message,
);
const pythonTestsOverJestFramework = evalTree({
  "pyproject.toml": "[project]\nname = \"demo\"\n",
  "tests/test_foo.py": "def test_ok():\n    assert True\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  pythonTestsOverJestFramework["test-framework"].pass,
  true,
  pythonTestsOverJestFramework["test-framework"].message,
);
assert.match(
  pythonTestsOverJestFramework["test-framework"].message,
  /test_foo\.py|conftest|pytest\.ini/,
);
assert.equal(
  /jest\.config/.test(pythonTestsOverJestFramework["test-framework"].message),
  false,
  pythonTestsOverJestFramework["test-framework"].message,
);
const pythonTfeOverJsStillPython = evalTree({
  "pyproject.toml": "[project]\nname = \"demo\"\n",
  "tests/test_foo.py": "def test_ok():\n    assert True\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(
  pythonTfeOverJsStillPython["test-files-exist"].pass,
  true,
  pythonTfeOverJsStillPython["test-files-exist"].message,
);
assert.match(pythonTfeOverJsStillPython["test-files-exist"].message, /test_foo\.py/);
assert.equal(
  /foo\.test\.js/.test(pythonTfeOverJsStillPython["test-files-exist"].message),
  false,
  pythonTfeOverJsStillPython["test-files-exist"].message,
);
const railsTfeOverJsStillRuby = evalTree({
  Gemfile: 'source "https://rubygems.org"\n',
  "test/foo_spec.rb": "RSpec.describe Foo do\nend\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(
  railsTfeOverJsStillRuby["test-files-exist"].pass,
  true,
  railsTfeOverJsStillRuby["test-files-exist"].message,
);
assert.match(railsTfeOverJsStillRuby["test-files-exist"].message, /foo_spec\.rb/);
assert.equal(
  /foo\.test\.js/.test(railsTfeOverJsStillRuby["test-files-exist"].message),
  false,
  railsTfeOverJsStillRuby["test-files-exist"].message,
);
const javaTfeOverJsStillJava = evalTree({
  "pom.xml": "<project></project>\n",
  "src/test/java/FooTest.java": "class FooTest {}\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(
  javaTfeOverJsStillJava["test-files-exist"].pass,
  true,
  javaTfeOverJsStillJava["test-files-exist"].message,
);
assert.match(javaTfeOverJsStillJava["test-files-exist"].message, /FooTest\.java/);
assert.equal(
  /foo\.test\.js/.test(javaTfeOverJsStillJava["test-files-exist"].message),
  false,
  javaTfeOverJsStillJava["test-files-exist"].message,
);
const mixTfeOverJsStillElixir = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "test/foo_test.exs": "defmodule FooTest do\nend\n",
  "assets/foo.test.js": "test('ok');\n",
});
assert.equal(
  mixTfeOverJsStillElixir["test-files-exist"].pass,
  true,
  mixTfeOverJsStillElixir["test-files-exist"].message,
);
assert.match(mixTfeOverJsStillElixir["test-files-exist"].message, /foo_test\.exs/);
assert.equal(
  /foo\.test\.js/.test(mixTfeOverJsStillElixir["test-files-exist"].message),
  false,
  mixTfeOverJsStillElixir["test-files-exist"].message,
);

const goPrimaryOverLoadJs = evalTree({
  "go.mod": "module example.com/x\n",
  "foo/acl_test.go": "package foo\n",
  "test/load/loadtest.js": "export default {};\n",
});
assert.equal(goPrimaryOverLoadJs["test-files-exist"].pass, true, goPrimaryOverLoadJs["test-files-exist"].message);
assert.equal(goPrimaryOverLoadJs["test-files-exist"].message.includes("Found 2 test file(s)"), true);
assert.match(goPrimaryOverLoadJs["test-files-exist"].message, /acl_test\.go/);
assert.equal(
  /loadtest\.js/.test(goPrimaryOverLoadJs["test-files-exist"].message),
  false,
  goPrimaryOverLoadJs["test-files-exist"].message,
);
assert.match(goPrimaryOverLoadJs["test-files-exist"].details, /^foo\/acl_test\.go\b/);
assert.match(goPrimaryOverLoadJs["test-files-exist"].details, /loadtest\.js/);
assert.equal(goPrimaryOverLoadJs["test-framework"].pass, true, goPrimaryOverLoadJs["test-framework"].message);
assert.match(goPrimaryOverLoadJs["test-framework"].message, /acl_test\.go/);
assert.equal(
  /loadtest\.js/.test(goPrimaryOverLoadJs["test-framework"].message),
  false,
  goPrimaryOverLoadJs["test-framework"].message,
);

const goPrimaryOverDeeperJsRank = evalTree({
  "go.mod": "module example.com/x\n",
  "foo/bar/acl_test.go": "package foo\n",
  "test/loadtest.js": "export default {};\n",
});
assert.equal(
  goPrimaryOverDeeperJsRank["test-files-exist"].pass,
  true,
  goPrimaryOverDeeperJsRank["test-files-exist"].message,
);
assert.match(goPrimaryOverDeeperJsRank["test-files-exist"].message, /acl_test\.go/);
assert.equal(
  /loadtest\.js/.test(goPrimaryOverDeeperJsRank["test-files-exist"].message),
  false,
  goPrimaryOverDeeperJsRank["test-files-exist"].message,
);

const goPrimaryOverVitest = evalTree({
  "go.mod": "module example.com/x\n",
  "foo/foo_test.go": "package foo\n",
  "vitest.config.ts": "export default {}\n",
});
assert.equal(goPrimaryOverVitest["test-framework"].pass, true, goPrimaryOverVitest["test-framework"].message);
assert.match(goPrimaryOverVitest["test-framework"].message, /foo_test\.go/);
assert.equal(
  /vitest\.config/.test(goPrimaryOverVitest["test-framework"].message),
  false,
  goPrimaryOverVitest["test-framework"].message,
);
assert.equal(goPrimaryOverVitest["test-files-exist"].pass, true, goPrimaryOverVitest["test-files-exist"].message);
assert.match(goPrimaryOverVitest["test-files-exist"].message, /foo_test\.go/);

const goPrimaryOverJest = evalTree({
  "go.mod": "module example.com/x\n",
  "foo/foo_test.go": "package foo\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(goPrimaryOverJest["test-framework"].pass, true, goPrimaryOverJest["test-framework"].message);
assert.match(goPrimaryOverJest["test-framework"].message, /foo_test\.go/);
assert.equal(
  /jest\.config/.test(goPrimaryOverJest["test-framework"].message),
  false,
  goPrimaryOverJest["test-framework"].message,
);

const goPrimaryOverSpecTs = evalTree({
  "go.mod": "module example.com/x\n",
  "foo/foo_test.go": "package foo\n",
  "assets/foo.spec.ts": "test('ok');\n",
});
assert.equal(goPrimaryOverSpecTs["test-files-exist"].pass, true, goPrimaryOverSpecTs["test-files-exist"].message);
assert.match(goPrimaryOverSpecTs["test-files-exist"].message, /foo_test\.go/);
assert.equal(
  /foo\.spec\.ts/.test(goPrimaryOverSpecTs["test-files-exist"].message),
  false,
  goPrimaryOverSpecTs["test-files-exist"].message,
);

const goPrimaryOverTestTs = evalTree({
  "go.mod": "module example.com/x\n",
  "foo/foo_test.go": "package foo\n",
  "assets/foo.test.ts": "test('ok');\n",
});
assert.equal(goPrimaryOverTestTs["test-files-exist"].pass, true, goPrimaryOverTestTs["test-files-exist"].message);
assert.match(goPrimaryOverTestTs["test-files-exist"].message, /foo_test\.go/);
assert.equal(
  /foo\.test\.ts/.test(goPrimaryOverTestTs["test-files-exist"].message),
  false,
  goPrimaryOverTestTs["test-files-exist"].message,
);

const goJsOnlyTfe = evalTree({
  "go.mod": "module example.com/x\n",
  "test/load/loadtest.js": "export default {};\n",
});
assert.equal(goJsOnlyTfe["test-files-exist"].pass, true, goJsOnlyTfe["test-files-exist"].message);
assert.match(goJsOnlyTfe["test-files-exist"].message, /loadtest\.js/);

const goJestOnly = evalTree({
  "go.mod": "module example.com/x\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(goJestOnly["test-framework"].pass, true, goJestOnly["test-framework"].message);
assert.match(goJestOnly["test-framework"].message, /jest\.config\.js/);

const goVitestOnly = evalTree({
  "go.mod": "module example.com/x\n",
  "vitest.config.ts": "export default {}\n",
});
assert.equal(goVitestOnly["test-framework"].pass, true, goVitestOnly["test-framework"].message);
assert.match(goVitestOnly["test-framework"].message, /vitest\.config\.ts/);

const tsPrimaryEncoderOverGo = evalTree({
  "package.json": { name: "demo" },
  "tsconfig.json": "{}\n",
  "encoder.test.ts": "test('ok');\n",
  "plugin_test.go": "package plugin\n",
});
assert.equal(
  tsPrimaryEncoderOverGo["test-files-exist"].pass,
  true,
  tsPrimaryEncoderOverGo["test-files-exist"].message,
);
assert.match(tsPrimaryEncoderOverGo["test-files-exist"].message, /encoder\.test\.ts/);
assert.equal(
  /plugin_test\.go/.test(tsPrimaryEncoderOverGo["test-files-exist"].message),
  false,
  tsPrimaryEncoderOverGo["test-files-exist"].message,
);
assert.equal(tsPrimaryEncoderOverGo["test-files-exist"].message.includes("Found 2 test file(s)"), true);
assert.match(tsPrimaryEncoderOverGo["test-files-exist"].details, /^encoder\.test\.ts\b/);
assert.match(tsPrimaryEncoderOverGo["test-files-exist"].details, /plugin_test\.go/);

const mixExUnitStillNamesExsFile = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "test/foo_test.exs": "defmodule FooTest do\nend\n",
  "jest.config.js": "export default {}\n",
});
assert.equal(
  mixExUnitStillNamesExsFile["test-framework"].pass,
  true,
  mixExUnitStillNamesExsFile["test-framework"].message,
);
assert.match(mixExUnitStillNamesExsFile["test-framework"].message, /foo_test\.exs/);
assert.equal(
  /jest\.config/.test(mixExUnitStillNamesExsFile["test-framework"].message),
  false,
  mixExUnitStillNamesExsFile["test-framework"].message,
);

assertPass("test-script", { justfile: "test:\n    cargo test\n" }, /justfile/);
assertPass("test-script", { Justfile: "test:\n    pytest\n" }, /Justfile/);
assertPass(
  "test-script",
  { "Taskfile.yml": "version: '3'\ntasks:\n  test:\n    cmds: [go test ./...]\n" },
  /Taskfile\.yml/,
);
assertFail("test-script", { justfile: "build:\n    cargo build\n" });
assertFail("test-script", { "support/build.gradle": "apply plugin: \"com.android.library\"\n" });
assertFail("test-script", { "build.gradle": "apply plugin: \"java\"\n" });
assertFail("test-script", { "build.gradle.kts": "plugins { java }\n" });
assertFail("test-script", { "Lib.csproj": "<Project></Project>\n" });
assertFail("test-script", { "Foo.csproj": "<Project></Project>\n" });
assertFail("test-script", { "Src/Foo/Foo.csproj": "<Project></Project>\n" });
assertFail("test-script", { "Foo.sln": "Microsoft Visual Studio Solution\n" });
assertFail("test-script", { "deps/jemalloc/msvc/foo.sln": "Microsoft Visual Studio Solution\n" });
assertPass("test-script", { "Foo.Tests.csproj": "<Project></Project>\n" }, /Foo\.Tests\.csproj/);
assertPass("test-script", { "Foo.Test.csproj": "<Project></Project>\n" }, /Foo\.Test\.csproj/);
assertPass(
  "test-script",
  { "Src/Lib.Tests/Lib.Tests.csproj": "<Project></Project>\n" },
  /Lib\.Tests\.csproj/,
);
const testsOverFuzzScript = evalTree({
  "Src/Lib.FuzzTests/Lib.FuzzTests.csproj": "<Project></Project>\n",
  "Src/Lib.Tests/Lib.Tests.csproj": "<Project></Project>\n",
});
assert.equal(
  testsOverFuzzScript["test-script"].pass,
  true,
  testsOverFuzzScript["test-script"].message,
);
assert.match(testsOverFuzzScript["test-script"].message, /Lib\.Tests\.csproj/);
assert.equal(
  /FuzzTests/.test(testsOverFuzzScript["test-script"].message),
  false,
  testsOverFuzzScript["test-script"].message,
);
assertPass(
  "test-script",
  { "Src/Lib.FuzzTests/Lib.FuzzTests.csproj": "<Project></Project>\n" },
  /Lib\.FuzzTests\.csproj/,
);
const benchAndTests = evalTree({
  "Src/Foo.BenchmarkTests/Foo.BenchmarkTests.csproj": "<Project></Project>\n",
  "Src/Foo.Tests/Foo.Tests.csproj": "<Project></Project>\n",
});
assert.equal(benchAndTests["test-script"].pass, true, benchAndTests["test-script"].message);
assert.match(benchAndTests["test-script"].message, /Foo\.Tests\.csproj/);
assert.equal(/Benchmark/.test(benchAndTests["test-script"].message), false);
assertPass("setup-script", { "Foo.csproj": "<Project></Project>\n" }, /Foo\.csproj/);
assertFail("test-framework", { "Foo.csproj": "<Project></Project>\n" });
const nestedLibOverTestsAndFuzz = evalTree({
  "Src/Lib/Lib.csproj": "<Project></Project>\n",
  "Src/Lib.Tests/Lib.Tests.csproj": "<Project></Project>\n",
  "Src/Lib.FuzzTests/Lib.FuzzTests.csproj": "<Project></Project>\n",
});
assert.equal(nestedLibOverTestsAndFuzz["setup-script"].pass, true, nestedLibOverTestsAndFuzz["setup-script"].message);
assert.match(nestedLibOverTestsAndFuzz["setup-script"].message, /Lib\.csproj/);
assert.equal(
  /FuzzTests/.test(nestedLibOverTestsAndFuzz["setup-script"].message),
  false,
  nestedLibOverTestsAndFuzz["setup-script"].message,
);
assert.equal(
  /Tests\.csproj/.test(nestedLibOverTestsAndFuzz["setup-script"].message),
  false,
  nestedLibOverTestsAndFuzz["setup-script"].message,
);
assert.equal(nestedLibOverTestsAndFuzz["test-script"].pass, true, nestedLibOverTestsAndFuzz["test-script"].message);
assert.match(nestedLibOverTestsAndFuzz["test-script"].message, /Lib\.Tests\.csproj/);
assert.equal(
  /FuzzTests/.test(nestedLibOverTestsAndFuzz["test-script"].message),
  false,
  nestedLibOverTestsAndFuzz["test-script"].message,
);
assert.equal(nestedLibOverTestsAndFuzz["test-framework"].pass, true, nestedLibOverTestsAndFuzz["test-framework"].message);
assert.match(nestedLibOverTestsAndFuzz["test-framework"].message, /Lib\.Tests\.csproj/);
assert.equal(
  /FuzzTests/.test(nestedLibOverTestsAndFuzz["test-framework"].message),
  false,
  nestedLibOverTestsAndFuzz["test-framework"].message,
);
assert.equal(nestedLibOverTestsAndFuzz.linter.pass, false, nestedLibOverTestsAndFuzz.linter.message);
assertPass(
  "setup-script",
  { "Src/Lib.FuzzTests/Lib.FuzzTests.csproj": "<Project></Project>\n" },
  /Lib\.FuzzTests\.csproj/,
);
assertPass(
  "setup-script",
  { "Src/Lib.Tests/Lib.Tests.csproj": "<Project></Project>\n" },
  /Lib\.Tests\.csproj/,
);
const testsAndFuzzSetup = evalTree({
  "Src/Lib.FuzzTests/Lib.FuzzTests.csproj": "<Project></Project>\n",
  "Src/Lib.Tests/Lib.Tests.csproj": "<Project></Project>\n",
});
assert.equal(testsAndFuzzSetup["setup-script"].pass, true, testsAndFuzzSetup["setup-script"].message);
assert.match(testsAndFuzzSetup["setup-script"].message, /Lib\.Tests\.csproj/);
assert.equal(/FuzzTests/.test(testsAndFuzzSetup["setup-script"].message), false);
const benchAndProductSetup = evalTree({
  "Src/Foo/Foo.csproj": "<Project></Project>\n",
  "Src/Foo.BenchmarkTests/Foo.BenchmarkTests.csproj": "<Project></Project>\n",
});
assert.equal(benchAndProductSetup["setup-script"].pass, true, benchAndProductSetup["setup-script"].message);
assert.match(benchAndProductSetup["setup-script"].message, /Foo\.csproj/);
assert.equal(/Benchmark/.test(benchAndProductSetup["setup-script"].message), false);
const libOverTestConsole = evalTree({
  "Lib.csproj": "<Project></Project>\n",
  "Lib.TestConsole.csproj": "<Project></Project>\n",
});
assert.equal(libOverTestConsole["setup-script"].pass, true, libOverTestConsole["setup-script"].message);
assert.match(libOverTestConsole["setup-script"].message, /Lib\.csproj/);
assert.equal(
  /TestConsole/.test(libOverTestConsole["setup-script"].message),
  false,
  libOverTestConsole["setup-script"].message,
);
const nestedLibOverTestConsole = evalTree({
  "Src/Lib/Lib.csproj": "<Project></Project>\n",
  "Src/Lib.TestConsole/Lib.TestConsole.csproj": "<Project></Project>\n",
});
assert.equal(
  nestedLibOverTestConsole["setup-script"].pass,
  true,
  nestedLibOverTestConsole["setup-script"].message,
);
assert.match(nestedLibOverTestConsole["setup-script"].message, /Lib\.csproj/);
assert.equal(
  /TestConsole/.test(nestedLibOverTestConsole["setup-script"].message),
  false,
  nestedLibOverTestConsole["setup-script"].message,
);
assertPass("setup-script", { "TestConsole.csproj": "<Project></Project>\n" }, /TestConsole\.csproj/);
assertPass("setup-script", { "Lib.Demo.csproj": "<Project></Project>\n" }, /Lib\.Demo\.csproj/);
const libOverDemo = evalTree({
  "Lib.csproj": "<Project></Project>\n",
  "Lib.Demo.csproj": "<Project></Project>\n",
});
assert.equal(libOverDemo["setup-script"].pass, true, libOverDemo["setup-script"].message);
assert.match(libOverDemo["setup-script"].message, /Lib\.csproj/);
assert.equal(/Demo/.test(libOverDemo["setup-script"].message), false, libOverDemo["setup-script"].message);
const libOverTestsAndFuzz = evalTree({
  "Lib.csproj": "<Project></Project>\n",
  "Lib.Tests.csproj": "<Project></Project>\n",
  "FuzzTests.csproj": "<Project></Project>\n",
});
assert.equal(libOverTestsAndFuzz["setup-script"].pass, true, libOverTestsAndFuzz["setup-script"].message);
assert.match(libOverTestsAndFuzz["setup-script"].message, /Lib\.csproj/);
assert.equal(
  /Tests\.csproj/.test(libOverTestsAndFuzz["setup-script"].message),
  false,
  libOverTestsAndFuzz["setup-script"].message,
);
assert.equal(
  /FuzzTests/.test(libOverTestsAndFuzz["setup-script"].message),
  false,
  libOverTestsAndFuzz["setup-script"].message,
);
assert.equal(libOverTestsAndFuzz["test-script"].pass, true, libOverTestsAndFuzz["test-script"].message);
assert.match(libOverTestsAndFuzz["test-script"].message, /Lib\.Tests\.csproj/);
assert.equal(/FuzzTests/.test(libOverTestsAndFuzz["test-script"].message), false);
assert.equal(libOverTestsAndFuzz["test-framework"].pass, true, libOverTestsAndFuzz["test-framework"].message);
assert.match(libOverTestsAndFuzz["test-framework"].message, /Lib\.Tests\.csproj/);
assert.equal(/FuzzTests/.test(libOverTestsAndFuzz["test-framework"].message), false);
const mixCmakeRanks = evalTree({
  "mix.exs": "defmodule Plug.MixProject do\nend\n",
  "CMakeLists.txt": "project(demo)\n",
  "support/build.gradle": "apply plugin: \"com.android.library\"\n",
});
assert.equal(mixCmakeRanks["setup-script"].pass, true, mixCmakeRanks["setup-script"].message);
assert.match(mixCmakeRanks["setup-script"].message, /CMakeLists\.txt/);
assert.equal(/support\//.test(mixCmakeRanks["setup-script"].message), false, mixCmakeRanks["setup-script"].message);
assert.equal(/mix\.exs/.test(mixCmakeRanks["setup-script"].message), false, mixCmakeRanks["setup-script"].message);
const pyprojectOverModulesSetup = evalTree({
  "pyproject.toml": "[build-system]\nrequires = [\"setuptools\"]\n",
  "lib/foo/modules/setup.py": "from setuptools import setup\n",
});
assert.equal(
  pyprojectOverModulesSetup["setup-script"].pass,
  true,
  pyprojectOverModulesSetup["setup-script"].message,
);
assert.match(pyprojectOverModulesSetup["setup-script"].message, /pyproject\.toml/);
assert.equal(
  /modules\//.test(pyprojectOverModulesSetup["setup-script"].message),
  false,
  pyprojectOverModulesSetup["setup-script"].message,
);
const makefileOverModulesSetup = evalTree({
  Makefile: "all:\n\t@echo ok\n",
  "lib/foo/modules/setup.py": "from setuptools import setup\n",
});
assert.equal(
  makefileOverModulesSetup["setup-script"].pass,
  true,
  makefileOverModulesSetup["setup-script"].message,
);
assert.match(makefileOverModulesSetup["setup-script"].message, /Makefile/);
assert.equal(
  /modules\//.test(makefileOverModulesSetup["setup-script"].message),
  false,
  makefileOverModulesSetup["setup-script"].message,
);
const rootSetupOverModulesSetup = evalTree({
  "setup.py": "from setuptools import setup\n",
  "lib/foo/modules/setup.py": "from setuptools import setup\n",
});
assert.equal(
  rootSetupOverModulesSetup["setup-script"].pass,
  true,
  rootSetupOverModulesSetup["setup-script"].message,
);
assert.match(rootSetupOverModulesSetup["setup-script"].message, /^Found setup\.py$/);
assert.equal(/modules\//.test(rootSetupOverModulesSetup["setup-script"].message), false);
assertPass(
  "setup-script",
  { "lib/foo/modules/setup.py": "from setuptools import setup\n" },
  /lib\/foo\/modules\/setup\.py/,
);
const setupCfgOverModulesSetup = evalTree({
  "setup.cfg": "[metadata]\nname = foo\n",
  "lib/foo/modules/setup.py": "from setuptools import setup\n",
});
assert.equal(setupCfgOverModulesSetup["setup-script"].pass, true, setupCfgOverModulesSetup["setup-script"].message);
assert.match(setupCfgOverModulesSetup["setup-script"].message, /setup\.cfg/);
assert.equal(/modules\//.test(setupCfgOverModulesSetup["setup-script"].message), false);
const cmakeOverModulesSetup = evalTree({
  "CMakeLists.txt": "project(demo)\n",
  "lib/foo/modules/setup.py": "from setuptools import setup\n",
});
assert.equal(cmakeOverModulesSetup["setup-script"].pass, true, cmakeOverModulesSetup["setup-script"].message);
assert.match(cmakeOverModulesSetup["setup-script"].message, /CMakeLists\.txt/);
assert.equal(/modules\//.test(cmakeOverModulesSetup["setup-script"].message), false);
const packageJsonOverModulesSetup = evalTree({
  "package.json": { scripts: { test: "node --test" } },
  "lib/foo/plugins/setup.py": "from setuptools import setup\n",
});
assert.equal(
  packageJsonOverModulesSetup["setup-script"].pass,
  true,
  packageJsonOverModulesSetup["setup-script"].message,
);
assert.match(packageJsonOverModulesSetup["setup-script"].message, /scripts\.test/);
assert.equal(/plugins\//.test(packageJsonOverModulesSetup["setup-script"].message), false);
assertPass(
  "setup-script",
  { "lib/foo/plugin/setup.py": "from setuptools import setup\n" },
  /lib\/foo\/plugin\/setup\.py/,
);
assertPass(
  "setup-script",
  { "lib/foo/module/setup.py": "from setuptools import setup\n" },
  /lib\/foo\/module\/setup\.py/,
);
const goModAndModulesSetup = evalTree({
  "go.mod": "module example.com/foo\n",
  "lib/foo/modules/setup.py": "from setuptools import setup\n",
});
assert.equal(goModAndModulesSetup["setup-script"].pass, true, goModAndModulesSetup["setup-script"].message);
assert.match(goModAndModulesSetup["setup-script"].message, /lib\/foo\/modules\/setup\.py/);
assert.equal(/go\.mod/.test(goModAndModulesSetup["setup-script"].message), false);
assertPass("setup-script", { "mix.exs": "defmodule Plug.MixProject do\nend\n" }, /mix\.exs/);
assertPass("test-script", { "Foo.Tests.sln": "Microsoft Visual Studio Solution\n" }, /Foo\.Tests\.sln/);
assertPass("test-script", { Makefile: "test:\n\t@echo ok\n" }, /Makefile/);
assertPass("test-script", { "scripts/test.sh": "pytest\n" }, /scripts\/test\.sh/);
assertPass("test-script", { gradlew: "#!/bin/sh\n" }, /gradlew/);
const redisLikeTestScript = evalTree({
  Makefile: "test:\n\t@echo ok\n",
  "tests/test_helper.c": "int main() { return 0; }\n",
  "deps/jemalloc/msvc/foo.sln": "Microsoft Visual Studio Solution\n",
});
assert.equal(redisLikeTestScript["test-script"].pass, true, redisLikeTestScript["test-script"].message);
assert.match(redisLikeTestScript["test-script"].message, /Makefile/);
assert.equal(/\.sln/.test(redisLikeTestScript["test-script"].message), false);
const flaskLikeTestScript = evalTree({
  "pyproject.toml": "[tool.pytest.ini_options]\n",
  "examples/javascript/pyproject.toml": "[tool.pytest.ini_options]\n",
});
assert.equal(flaskLikeTestScript["test-script"].pass, true, flaskLikeTestScript["test-script"].message);
assert.match(flaskLikeTestScript["test-script"].message, /pyproject\.toml/);
assert.equal(/examples\//.test(flaskLikeTestScript["test-script"].message), false);

assertPass("contributing", { "CONTRIBUTING.rst": "How to contribute\n" }, /CONTRIBUTING\.rst/);
assertPass("contributing", { CONTRIBUTING: "How to contribute\n" }, /CONTRIBUTING/);
assertPass("contributing", { ".github/CONTRIBUTING.rst": "How to contribute\n" }, /\.github\/CONTRIBUTING\.rst/);
assertPass(
  "contributing",
  { "CONTRIBUTING.md": "# Contributing\nPlease open a PR.\n" },
  /CONTRIBUTING\.md/,
);
assertPass(
  "contributing",
  { "docs/CONTRIBUTING.md": "# Contributing\nPlease open a PR.\n" },
  /docs\/CONTRIBUTING\.md/,
);
assertFail("contributing", { "CONTRIBUTING.md": "" });
assertFail("contributing", { ".github/CONTRIBUTING.md": "" });
assertFail("contributing", { "docs/CONTRIBUTING.md": "  \n\t\n" });
assertPass("contributing", { "contributing.md": "How to contribute\n" }, /^Found contributing\.md$/);
assertPass(
  "contributing",
  { ".github/contributing.md": "How to contribute\n" },
  /^Found \.github\/contributing\.md$/,
);
assertPass("contributing", { "docs/Contributing.md": "How to contribute\n" }, /docs\/Contributing\.md/);
assertPass("contributing", { "Contributing.rst": "How to contribute\n" }, /Contributing\.rst/);
assertFail("contributing", { "contributing.md": "" });
assertFail("contributing", { ".github/contributing.md": "   \n" });
assertPass("readme", { "README.rst": `${"A".repeat(520)}\n` }, /README\.rst/);
assertFail("readme", { "README.rst": "short\n" });
assertPass("readme", { "README.markdown": `${"A".repeat(520)}\n` }, /README\.markdown found/);
assertPass("readme", { "README.mkd": `${"A".repeat(520)}\n` }, /README\.mkd found/);
assertPass("readme", { "ReadMe.md": `${"A".repeat(520)}\n` }, /^ReadMe\.md found/);
assertFail("readme", { "README.markdown": "short\n" });
assertFail("readme", { "readme.markdown": `${"A".repeat(400)}\n` });
const mixedCaseReadmeDepth = evalTree({
  "readme.md": `${"A".repeat(520)}\n`,
  "packages/foo/README.md": `${"B".repeat(520)}\n`,
});
assert.match(mixedCaseReadmeDepth.readme.message, /^readme\.md found/);
const markdownOverNestedReadme = evalTree({
  "README.markdown": `${"A".repeat(520)}\n`,
  "docs/readme.md": `${"B".repeat(520)}\n`,
});
assert.match(markdownOverNestedReadme.readme.message, /^README\.markdown found/);
const shortRootReadme = evalTree({
  "README.md": "short\n",
  "docs/README.md": `${"B".repeat(520)}\n`,
});
assert.equal(shortRootReadme.readme.pass, true, shortRootReadme.readme.message);
assert.match(shortRootReadme.readme.message, /docs\/README\.md found/);
const mixedCaseContribDepth = evalTree({
  "contributing.md": "How to contribute\n",
  "docs/CONTRIBUTING.md": "How to contribute\n",
});
assert.equal(mixedCaseContribDepth.contributing.message, "Found contributing.md");

assertPass("api-docs", { "svc/openapi.yaml": "openapi: 3.0.0\n" }, /openapi\.yaml/);
assertPass("api-docs", { "svc/openapi.yml": "openapi: 3.0.0\n" }, /openapi\.yml/);
assertPass("api-docs", { "docs/swagger.yaml": "swagger: '2.0'\n" }, /swagger\.yaml/);
assertPass("api-docs", { "redocly.yaml": "apis: {}\n" }, /redocly\.yaml/);
assertPass("api-docs", { "docs/api/index.md": "# API\n" }, /docs\/api/);
assertFail("api-docs", { "mkdocs.yml": "site_name: docs\n" });
assertFail("api-docs", { "conf.py": "project = 'docs'\n" });

assertPass("codeowners", { "docs/CODEOWNERS": "* @team\n" }, /docs\/CODEOWNERS/);
assertPass("codeowners", { CODEOWNERS: "* @team\n" }, /^Found CODEOWNERS$/);
assertPass("codeowners", { ".github/CODEOWNERS": "* @team\n" }, /\.github\/CODEOWNERS/);
const missingCodeowners = evalTree({});
assert.equal(missingCodeowners.codeowners.pass, false);
assert.equal(missingCodeowners.codeowners.skipped, false);
assert.equal(missingCodeowners.codeowners.pillarId, "security");
assert.equal(missingCodeowners.codeowners.level, 3);
const ownersFailDir = tmp("code-readiness-owners-fail-");
writeTree(ownersFailDir, {});
const ownersFailReport = buildReport(evaluateRepo(ownersFailDir), {
  repoRoot: ownersFailDir,
  repoName: "owners-fail",
});
const ownersFailRow = ownersFailReport.criterion_results.find((row) => row.criterionId === "codeowners");
assert.equal(ownersFailRow.pillarId, "security");
assert.equal(ownersFailRow.pillarName, "Security");
assert.equal(ownersFailRow.pass, false);
assert.equal(
  ownersFailReport.pillar_scores.find((pillar) => pillar.pillarId === "security").name,
  "Security",
);
assert.equal(
  ownersFailReport.pillar_scores.find((pillar) => pillar.pillarId === "style-linting").name,
  "Style & Validation",
);
assert.equal(
  ownersFailReport.criterion_results.find((row) => row.criterionId === "linter").pillarName,
  "Style & Validation",
);
assert.equal(
  ownersFailReport.criterion_results.find((row) => row.criterionId === "linter").pillarId,
  "style-linting",
);
assertPass(
  "issue-templates",
  { ".github/ISSUE_TEMPLATE.md": "## Bug\n" },
  /\.github\/ISSUE_TEMPLATE\.md/,
);
assertPass(
  "issue-templates",
  { ".github/ISSUE_TEMPLATE/bug.yml": "name: Bug\n" },
  /\.github\/ISSUE_TEMPLATE\/bug\.yml/,
);
assertPass(
  "issue-templates",
  { ".github/PULL_REQUEST_TEMPLATE.md": "## Summary\n" },
  /\.github\/PULL_REQUEST_TEMPLATE\.md/,
);
assertPass(
  "issue-templates",
  { ".github/pull_request_template.md": "## Summary\n" },
  /\.github\/pull_request_template\.md/,
);
assertPass(
  "issue-templates",
  { ".github/ISSUE_TEMPLATE": "## Bug\n" },
  /\.github\/ISSUE_TEMPLATE/,
);
assertPass(
  "issue-templates",
  { ".github/PULL_REQUEST_TEMPLATE/pr.md": "## Summary\n" },
  /\.github\/PULL_REQUEST_TEMPLATE\/pr\.md/,
);
const prettierLikeIssueTemplates = evalTree({
  ".github/ISSUE_TEMPLATE/config.yml": "blank_issues_enabled: false\n",
  ".github/ISSUE_TEMPLATE/formatting.md": "## Formatting\n",
  ".github/ISSUE_TEMPLATE/integration.md": "## Integration\n",
  ".github/PULL_REQUEST_TEMPLATE.md": "## Summary\n",
});
assert.equal(
  prettierLikeIssueTemplates["issue-templates"].pass,
  true,
  prettierLikeIssueTemplates["issue-templates"].message,
);
assert.match(prettierLikeIssueTemplates["issue-templates"].message, /formatting\.md/);
assert.equal(
  /config\.ya?ml/.test(prettierLikeIssueTemplates["issue-templates"].message),
  false,
  prettierLikeIssueTemplates["issue-templates"].message,
);
assert.equal(
  /PULL_REQUEST_TEMPLATE/.test(prettierLikeIssueTemplates["issue-templates"].message),
  false,
  prettierLikeIssueTemplates["issue-templates"].message,
);
const bugReportAndConfig = evalTree({
  ".github/ISSUE_TEMPLATE/Bug_report.yml": "name: Bug\n",
  ".github/ISSUE_TEMPLATE/config.yml": "blank_issues_enabled: false\n",
});
assert.equal(bugReportAndConfig["issue-templates"].pass, true, bugReportAndConfig["issue-templates"].message);
assert.match(bugReportAndConfig["issue-templates"].message, /Bug_report\.yml/);
assert.equal(
  /config\.ya?ml/.test(bugReportAndConfig["issue-templates"].message),
  false,
  bugReportAndConfig["issue-templates"].message,
);
const nestedFormAndConfig = evalTree({
  ".github/ISSUE_TEMPLATE/config.yml": "blank_issues_enabled: false\n",
  ".github/ISSUE_TEMPLATE/nested/deep.md": "## Deep\n",
  ".github/ISSUE_TEMPLATE/formatting.md": "## Formatting\n",
});
assert.equal(nestedFormAndConfig["issue-templates"].pass, true, nestedFormAndConfig["issue-templates"].message);
assert.match(nestedFormAndConfig["issue-templates"].message, /formatting\.md/);
assert.equal(/nested\//.test(nestedFormAndConfig["issue-templates"].message), false);
const bugReportAndPrTemplate = evalTree({
  ".github/ISSUE_TEMPLATE/Bug_report.yml": "name: Bug\n",
  ".github/PULL_REQUEST_TEMPLATE.md": "## Summary\n",
});
assert.equal(
  bugReportAndPrTemplate["issue-templates"].pass,
  true,
  bugReportAndPrTemplate["issue-templates"].message,
);
assert.match(bugReportAndPrTemplate["issue-templates"].message, /Bug_report\.yml/);
assert.equal(
  /PULL_REQUEST_TEMPLATE/.test(bugReportAndPrTemplate["issue-templates"].message),
  false,
  bugReportAndPrTemplate["issue-templates"].message,
);
const bugMdAndPrTemplate = evalTree({
  ".github/ISSUE_TEMPLATE/bug_report.md": "## Bug\n",
  ".github/PULL_REQUEST_TEMPLATE.md": "## Summary\n",
});
assert.equal(
  bugMdAndPrTemplate["issue-templates"].pass,
  true,
  bugMdAndPrTemplate["issue-templates"].message,
);
assert.match(bugMdAndPrTemplate["issue-templates"].message, /bug_report\.md/);
assert.equal(
  /PULL_REQUEST_TEMPLATE/.test(bugMdAndPrTemplate["issue-templates"].message),
  false,
  bugMdAndPrTemplate["issue-templates"].message,
);
assertPass(
  "issue-templates",
  { ".github/ISSUE_TEMPLATE/config.yml": "blank_issues_enabled: false\n" },
  /\.github\/ISSUE_TEMPLATE\/config\.yml/,
);
assertPass(
  "issue-templates",
  { ".github/ISSUE_TEMPLATE/config.yaml": "blank_issues_enabled: false\n" },
  /\.github\/ISSUE_TEMPLATE\/config\.yaml/,
);
const emptyIssueDir = tmp("code-readiness-empty-issue-");
fs.mkdirSync(path.join(emptyIssueDir, ".github", "ISSUE_TEMPLATE"), { recursive: true });
const emptyIssueTemplates = resultById(evaluateRepo(emptyIssueDir));
assert.equal(
  emptyIssueTemplates["issue-templates"].pass,
  false,
  emptyIssueTemplates["issue-templates"].message,
);
assertFail("issue-templates", {});
assertFail("issue-templates", { "docs/ISSUE_TEMPLATE.md": "## Bug\n" });
assertFail("issue-templates", { "ISSUE_TEMPLATE.md": "## Bug\n" });
assertPass("ai-context", { "packages/app/AGENTS.md": "# agents\n" }, /packages\/app\/AGENTS\.md/);
assertPass("linter", { "apps/web/biome.json": "{}\n" }, /apps\/web\/biome\.json/);
assertPass("type-checker", { "packages/lib/tsconfig.json": "{}\n" }, /packages\/lib\/tsconfig\.json/);
assert.equal(evalTree({ "packages/lib/tsconfig.json": "{}\n" })["type-checker"].skipped, false);
const productAndTestTsconfig = evalTree({
  "packages/foo/test/tsconfig.json": "{}\n",
  "packages/foo/tsconfig.json": "{}\n",
});
assert.equal(
  productAndTestTsconfig["type-checker"].pass,
  true,
  productAndTestTsconfig["type-checker"].message,
);
assert.match(
  productAndTestTsconfig["type-checker"].message,
  /^Found packages\/foo\/tsconfig\.json$/,
);
assert.equal(
  /test\//.test(productAndTestTsconfig["type-checker"].message),
  false,
  productAndTestTsconfig["type-checker"].message,
);
assertPass(
  "type-checker",
  { "packages/foo/test/tsconfig.json": "{}\n" },
  /^Found packages\/foo\/test\/tsconfig\.json$/,
);
const rootTsconfigWins = evalTree({
  "tsconfig.json": "{}\n",
  "packages/foo/test/tsconfig.json": "{}\n",
  "packages/lib/tsconfig.json": "{}\n",
});
assert.equal(rootTsconfigWins["type-checker"].pass, true, rootTsconfigWins["type-checker"].message);
assert.match(rootTsconfigWins["type-checker"].message, /tsconfig\.json/);
assert.equal(/packages\//.test(rootTsconfigWins["type-checker"].message), false);
assertPass(
  "type-checker",
  {
    "packages/foo/tests/tsconfig.json": "{}\n",
    "packages/foo/tsconfig.json": "{}\n",
  },
  /^Found packages\/foo\/tsconfig\.json$/,
);
assertPass(
  "type-checker",
  {
    "packages/app/spec/tsconfig.json": "{}\n",
    "packages/app/tsconfig.json": "{}\n",
  },
  /^Found packages\/app\/tsconfig\.json$/,
);
assertPass(
  "type-checker",
  {
    "packages/app/__tests__/tsconfig.json": "{}\n",
    "packages/app/tsconfig.json": "{}\n",
  },
  /^Found packages\/app\/tsconfig\.json$/,
);
assertPass(
  "type-checker",
  {
    "test/tsconfig.json": "{}\n",
    "packages/foo/tsconfig.json": "{}\n",
  },
  /^Found packages\/foo\/tsconfig\.json$/,
);
assertPass("type-checker", { "test/tsconfig.json": "{}\n" }, /^Found test\/tsconfig\.json$/);
assertPass("type-checker", { "tests/tsconfig.json": "{}\n" }, /^Found tests\/tsconfig\.json$/);
assertPass("type-checker", { "spec/tsconfig.json": "{}\n" }, /^Found spec\/tsconfig\.json$/);
assertPass(
  "type-checker",
  { "__tests__/tsconfig.json": "{}\n" },
  /^Found __tests__\/tsconfig\.json$/,
);
const pkgAndFixtureTsconfig = evalTree({
  "packages/foo/tsconfig.json": "{}\n",
  "fixtures/tsconfig.json": "{}\n",
});
assert.equal(
  pkgAndFixtureTsconfig["type-checker"].pass,
  true,
  pkgAndFixtureTsconfig["type-checker"].message,
);
assert.match(
  pkgAndFixtureTsconfig["type-checker"].message,
  /^Found packages\/foo\/tsconfig\.json$/,
);
assert.equal(
  /fixtures/.test(pkgAndFixtureTsconfig["type-checker"].message),
  false,
  pkgAndFixtureTsconfig["type-checker"].message,
);
const rootAndTestdataTsconfig = evalTree({
  "testdata/tsconfig.json": "{}\n",
  "tsconfig.json": "{}\n",
});
assert.equal(
  rootAndTestdataTsconfig["type-checker"].pass,
  true,
  rootAndTestdataTsconfig["type-checker"].message,
);
assert.match(rootAndTestdataTsconfig["type-checker"].message, /^Found tsconfig\.json$/);
assert.equal(
  /testdata\//.test(rootAndTestdataTsconfig["type-checker"].message),
  false,
  rootAndTestdataTsconfig["type-checker"].message,
);
assertPass("type-checker", { "fixtures/tsconfig.json": "{}\n" }, /^Found fixtures\/tsconfig\.json$/);
assertPass("type-checker", { "testdata/tsconfig.json": "{}\n" }, /^Found testdata\/tsconfig\.json$/);
const productOverEslintPlugin = evalTree({
  "packages/foo/tsconfig.json": "{}\n",
  "packages/eslint-plugin-foo/tsconfig.json": "{}\n",
});
assert.equal(
  productOverEslintPlugin["type-checker"].pass,
  true,
  productOverEslintPlugin["type-checker"].message,
);
assert.match(
  productOverEslintPlugin["type-checker"].message,
  /^Found packages\/foo\/tsconfig\.json$/,
);
assert.equal(
  /eslint-plugin/.test(productOverEslintPlugin["type-checker"].message),
  false,
  productOverEslintPlugin["type-checker"].message,
);
assertPass(
  "type-checker",
  {
    "tsconfig.json": "{}\n",
    "packages/foo/tsconfig.json": "{}\n",
  },
  /^Found tsconfig\.json$/,
);
assertPass(
  "type-checker",
  { "packages/eslint-plugin-foo/tsconfig.json": "{}\n" },
  /^Found packages\/eslint-plugin-foo\/tsconfig\.json$/,
);
assertPass(
  "type-checker",
  {
    "packages/foo/tsconfig.json": "{}\n",
    "packages/plugin/tsconfig.json": "{}\n",
  },
  /^Found packages\/foo\/tsconfig\.json$/,
);
assertPass(
  "type-checker",
  {
    "packages/foo/tsconfig.json": "{}\n",
    "packages/plugins/tsconfig.json": "{}\n",
  },
  /^Found packages\/foo\/tsconfig\.json$/,
);
assertPass(
  "type-checker",
  {
    "packages/foo/tsconfig.json": "{}\n",
    "packages/hooks/tsconfig.json": "{}\n",
  },
  /^Found packages\/foo\/tsconfig\.json$/,
);
assertPass(
  "type-checker",
  {
    "packages/foo/tsconfig.json": "{}\n",
    "hooks/tsconfig.json": "{}\n",
  },
  /^Found packages\/foo\/tsconfig\.json$/,
);
assertPass(
  "type-checker",
  {
    "packages/foo/tsconfig.json": "{}\n",
    "compiler/tsconfig.json": "{}\n",
  },
  /^Found packages\/foo\/tsconfig\.json$/,
);
assertPass(
  "type-checker",
  { "packages/plugin/tsconfig.json": "{}\n" },
  /^Found packages\/plugin\/tsconfig\.json$/,
);
assertPass(
  "type-checker",
  { "packages/hooks/tsconfig.json": "{}\n" },
  /^Found packages\/hooks\/tsconfig\.json$/,
);
const pkgOverNestedPlayground = evalTree({
  "packages/foo/tsconfig.json": "{}\n",
  "compiler/apps/playground/tsconfig.json": "{}\n",
});
assert.equal(
  pkgOverNestedPlayground["type-checker"].pass,
  true,
  pkgOverNestedPlayground["type-checker"].message,
);
assert.match(
  pkgOverNestedPlayground["type-checker"].message,
  /^Found packages\/foo\/tsconfig\.json$/,
);
assert.equal(
  /playground/.test(pkgOverNestedPlayground["type-checker"].message),
  false,
  pkgOverNestedPlayground["type-checker"].message,
);
const nestedPkgOverPlayground = evalTree({
  "compiler/packages/foo/tsconfig.json": "{}\n",
  "compiler/apps/playground/tsconfig.json": "{}\n",
});
assert.equal(
  nestedPkgOverPlayground["type-checker"].pass,
  true,
  nestedPkgOverPlayground["type-checker"].message,
);
assert.match(
  nestedPkgOverPlayground["type-checker"].message,
  /^Found compiler\/packages\/foo\/tsconfig\.json$/,
);
assert.equal(
  /playground/.test(nestedPkgOverPlayground["type-checker"].message),
  false,
  nestedPkgOverPlayground["type-checker"].message,
);
assertPass(
  "type-checker",
  {
    "tsconfig.json": "{}\n",
    "compiler/packages/foo/tsconfig.json": "{}\n",
    "compiler/apps/playground/tsconfig.json": "{}\n",
  },
  /^Found tsconfig\.json$/,
);
assertPass(
  "type-checker",
  { "compiler/apps/playground/tsconfig.json": "{}\n" },
  /^Found compiler\/apps\/playground\/tsconfig\.json$/,
);
assertPass(
  "type-checker",
  { "apps/playground/tsconfig.json": "{}\n" },
  /^Found apps\/playground\/tsconfig\.json$/,
);
assertPass("type-checker", { "Foo.csproj": "<Project></Project>\n" }, /C# has a built-in static type system/);
assert.equal(
  evalTree({ "mix.exs": "defmodule Demo.MixProject do\nend\n" })["type-checker"].skipped,
  true,
);
const mixCsharpTypeChecker = evalTree({
  "mix.exs": "defmodule Demo.MixProject do\nend\n",
  "Foo.csproj": "<Project></Project>\n",
});
assert.equal(
  mixCsharpTypeChecker["type-checker"].pass,
  true,
  mixCsharpTypeChecker["type-checker"].message,
);
assert.equal(mixCsharpTypeChecker["type-checker"].skipped, false);
assert.match(mixCsharpTypeChecker["type-checker"].message, /C# has a built-in static type system/);
assertPass("linter", { "crates/foo/.golangci.yml": "linters: {}\n" }, /crates\/foo\/\.golangci\.yml/);
assertPass("security-policy", { "security/SECURITY.md": "# Security\n" }, /security\/SECURITY\.md/);
const nestedEditor = evalTree({ "packages/foo/.editorconfig": "root = true\n" });
assert.equal(nestedEditor.editorconfig.pass, true, nestedEditor.editorconfig.message);
assert.equal(nestedEditor.editorconfig.skipped, false);
assert.equal(nestedEditor.linter.pass, false);
assertPass(
  "linter",
  { "packages/foo/package.json": { devDependencies: { eslint: "9.0.0" } } },
  /packages\/foo\/package\.json/,
);
assert.match(
  evalTree({ "packages/foo/package.json": { devDependencies: { eslint: "9.0.0" } } }).linter.message,
  /eslint/,
);
assertPass(
  "linter",
  { "crates/x/Cargo.toml": "[workspace]\n[workspace.lints]\nrust.unsafe_code = \"warn\"\n" },
  /\[workspace\.lints/,
);
assertPass(
  "linter",
  { "apps/api/pom.xml": "<project>errorprone</project>\n" },
  /errorprone/,
);
const hiddenTsconfig = evalTree({ "node_modules/foo/tsconfig.json": "{}\n" });
assert.equal(hiddenTsconfig["type-checker"].pass, false);
assert.equal(
  /tsconfig\.json/.test(hiddenTsconfig["type-checker"].message),
  false,
  hiddenTsconfig["type-checker"].message,
);
const examplesComposeSkip = evalTree({
  "examples/docker-compose.yml": "services: {}\n",
});
assert.equal(examplesComposeSkip["env-documentation"].skipped, true);
assert.equal(examplesComposeSkip["env-documentation"].pass, false);
assertPass("env-documentation", { "examples/.env.example": "FOO=\n" }, /\.env\.example/);
assertPass("readme", { "packages/foo/README.md": `${"A".repeat(520)}\n` }, /packages\/foo\/README\.md/);
const bothReadme = evalTree({
  "README.md": `${"A".repeat(520)}\n`,
  "packages/foo/README.md": `${"B".repeat(520)}\n`,
});
assert.equal(bothReadme.readme.pass, true, bothReadme.readme.message);
assert.match(bothReadme.readme.message, /README\.md found/);
assert.equal(/packages\/foo\/README\.md/.test(bothReadme.readme.message), false);
assertFail("readme", { "node_modules/foo/README.md": `${"A".repeat(520)}\n` });
assertPass("contributing", { "docs/guide/CONTRIBUTING.rst": "How to contribute\n" }, /CONTRIBUTING\.rst/);
assertPass("e2e-tests", { "packages/web/e2e/login.spec.ts": "test('ok', () => {});\n" }, /e2e/);
assertFail("e2e-tests", { "src/main/java/com/example/integration/Foo.java": "class Foo {}\n" });
const nestedBiomeSkipEditor = evalTree({ "apps/web/biome.json": "{}\n" });
assert.equal(nestedBiomeSkipEditor.linter.pass, true);
assert.equal(nestedBiomeSkipEditor.editorconfig.skipped, true, nestedBiomeSkipEditor.editorconfig.message);
const bothAgentsAndClaude = evalTree({
  "CLAUDE.md": "# claude\n",
  "AGENTS.md": "# agents\n",
});
assert.equal(bothAgentsAndClaude["ai-context"].pass, true, bothAgentsAndClaude["ai-context"].message);
assert.match(bothAgentsAndClaude["ai-context"].message, /^Found AGENTS\.md$/);
assert.equal(/CLAUDE\.md/.test(bothAgentsAndClaude["ai-context"].message), false);
assertPass("ai-context", { "CLAUDE.md": "# claude\n" }, /^Found CLAUDE\.md$/);
assertPass("ai-context", { ".github/AGENTS.md": "# agents\n" }, /\.github\/AGENTS\.md/);
assertPass("ai-context", { "GEMINI.md": "# gemini\n" }, /GEMINI\.md/);
assertPass("ai-context", { ".github/instructions/js.md": "# js\n" }, /instructions/);
assertPass("ai-context", { ".windsurfrules": "# rules\n" }, /windsurfrules/);
assertPass("ai-context", { "WARP.md": "# warp\n" }, /WARP\.md/);
assertFail("ai-context", { "README.md": "See AGENTS.md and GEMINI.md for agent context.\n" });
assertPass("architecture-docs", { "docs/adr/0001-record.md": "# adr\n" }, /docs\/adr/);
assertPass("architecture-docs", { "docs/decisions/0001.md": "# decision\n" }, /docs\/decisions/);
assertPass("architecture-docs", { "adr/0001.md": "# adr\n" }, /adr\/0001/);

assertPass("lock-file", { "mix.lock": "%{}\n" }, /mix\.lock/);
assertPass("lock-file", { "flake.lock": "{}\n" }, /flake\.lock/);
assertPass("lock-file", { "cabal.project.freeze": "constraints:\n" }, /cabal\.project\.freeze/);
assertPass("lock-file", { "pixi.lock": "version: 1\n" }, /pixi\.lock/);
assert.equal(evalTree({ "Main.hs": "main = return ()\n" })["lock-file"].skipped, true);
const rustLockSkip = evalTree({ "Cargo.toml": "[package]\nname = \"x\"\nversion = \"0.1.0\"\n" });
assert.equal(rustLockSkip["lock-file"].skipped, true, rustLockSkip["lock-file"].message);
assert.equal(rustLockSkip["lock-file"].pass, false);
const rustLockPass = evalTree({
  "Cargo.toml": "[package]\nname = \"x\"\nversion = \"0.1.0\"\n",
  "Cargo.lock": "# lock\n",
});
assert.equal(rustLockPass["lock-file"].pass, true, rustLockPass["lock-file"].message);
assert.equal(rustLockPass["lock-file"].skipped, false);
assert.match(rustLockPass["lock-file"].message, /Cargo\.lock/);

function assertNamedProductLock(byId, file) {
  assert.equal(byId["lock-file"].pass, true, byId["lock-file"].message);
  assert.equal(byId["lock-file"].skipped, false, byId["lock-file"].message);
  assert.equal(byId["lock-file"].message, `Found ${file}`);
  assert.equal(
    byId["no-outdated-deps"].message,
    `Lock file ${file} modified within 6 months`,
    byId["no-outdated-deps"].message,
  );
}

const mixedGoSumLock = evalTree({
  "go.sum": "example.com/x h1:abc\n",
  "_examples/rest/go.sum": "example.com/x h1:nested\n",
});
assertNamedProductLock(mixedGoSumLock, "go.sum");
assert.equal(/_examples/.test(mixedGoSumLock["lock-file"].message), false);
assert.equal(/_examples/.test(mixedGoSumLock["no-outdated-deps"].message), false);

const mixedPkgLock = evalTree({
  "package-lock.json": "{}\n",
  "examples/foo/package-lock.json": "{}\n",
});
assertNamedProductLock(mixedPkgLock, "package-lock.json");
assert.equal(/examples/.test(mixedPkgLock["lock-file"].message), false);
assert.equal(/examples/.test(mixedPkgLock["no-outdated-deps"].message), false);

const nestedNpmVsRootGo = evalTree({
  "go.sum": "example.com/x h1:abc\n",
  "_examples/rest/package-lock.json": "{}\n",
});
assertNamedProductLock(nestedNpmVsRootGo, "go.sum");
assert.equal(/package-lock/.test(nestedNpmVsRootGo["lock-file"].message), false);
assert.equal(/package-lock/.test(nestedNpmVsRootGo["no-outdated-deps"].message), false);

const examplesOnlyLock = evalTree({
  "examples/foo/go.sum": "example.com/x h1:abc\n",
});
assertNamedProductLock(examplesOnlyLock, "examples/foo/go.sum");

const vendorOnlyLock = evalTree({
  "go.mod": "module example.com/x\n",
  "vendor/foo/package-lock.json": "{}\n",
});
assert.equal(vendorOnlyLock["lock-file"].pass, false, vendorOnlyLock["lock-file"].message);
assert.equal(vendorOnlyLock["lock-file"].skipped, false, vendorOnlyLock["lock-file"].message);
assert.equal(/vendor/.test(vendorOnlyLock["lock-file"].message), false);
assert.equal(/vendor/.test(vendorOnlyLock["no-outdated-deps"].message), false);

const thirdPartyVsRootLock = evalTree({
  "go.sum": "example.com/x h1:abc\n",
  "third_party/bar/go.sum": "example.com/x h1:vendored\n",
});
assertNamedProductLock(thirdPartyVsRootLock, "go.sum");
assert.equal(/third_party/.test(thirdPartyVsRootLock["lock-file"].message), false);

assertPass("env-documentation", { "env.example": "FOO=\n" }, /env\.example/);
assertPass("env-documentation", { ".envrc.example": "export FOO=\n" }, /\.envrc\.example/);
assertPass("env-documentation", { "dotenv.example": "FOO=\n" }, /dotenv\.example/);
const nestedComposeStillSkip = evalTree({
  "sample/app/compose.yaml": "services: {}\n",
});
assert.equal(nestedComposeStillSkip["env-documentation"].skipped, true);

assertPass("setup-script", { justfile: "setup:\n    npm i\n" }, /justfile/);
assertPass("setup-script", { "Taskfile.yaml": "version: '3'\n" }, /Taskfile\.yaml/);
assertPass("setup-script", { "bootstrap.sh": "#!/bin/sh\n" }, /bootstrap\.sh/);
assertPass("setup-script", { "scripts/bootstrap-dev.sh": "#!/bin/sh\n" }, /scripts\/bootstrap/);
assertPass("setup-script", { "Cargo.toml": "[package]\nname = \"x\"\nversion = \"0.1.0\"\n" }, /Cargo\.toml/);
assertPass("setup-script", { "pom.xml": "<project></project>\n" }, /pom\.xml/);
assertPass("setup-script", { "CMakeLists.txt": "project(demo)\n" }, /CMakeLists\.txt/);
assertPass("setup-script", { "configure.ac": "AC_INIT([demo],[1.0])\n" }, /configure\.ac/);

assertPass("version-pinned", { ".go-version": "1.22.0\n" }, /\.go-version/);
assertPass("version-pinned", { "runtime.txt": "python-3.12.4\n" }, /python-/);
assertFail("version-pinned", { "runtime.txt": "node-20\n" });
assertFail("version-pinned", { ".tool-versions": "" });
assertFail("version-pinned", { "documentation/.tool-versions": "" });
assertPass("version-pinned", { "documentation/.tool-versions": "nodejs 24.19.0\n" }, /tool-versions/);
assertPass("version-pinned", { ".tool-versions": "java 21\n" }, /tool-versions/);
assertPass("version-pinned", { ".tool-versions": "nodejs 20\n" }, /tool-versions/);
assertPass(
  "version-pinned",
  {
    "gradle/plugins/common/src/main/kotlin/junitbuild.java-toolchain-conventions.gradle.kts":
      "java { toolchain { languageVersion.set(JavaLanguageVersion.of(25)) } }\n",
  },
  /JavaLanguageVersion/,
);
assertPass(
  "version-pinned",
  {
    "gradle/plugins/common/src/main/kotlin/junitbuild.java-toolchain-conventions.gradle.kts":
      "java { jvmToolchain(25) }\n",
  },
  /jvmToolchain/,
);
assertFail("version-pinned", { "packages/foo/build.gradle.kts": "plugins { java }\n" });
assertFail("version-pinned", { "convention.gradle.kts": "" });
assertPass(
  "version-pinned",
  { "tokio/Cargo.toml": '[package]\nname = "tokio"\nrust-version = "1.71"\n' },
  /rust-version/,
);
assertFail("version-pinned", { "testdata/go.mod": "module example.com/x\n\ngo 1.22\n" });
assertFail("version-pinned", { "fixtures/go.mod": "module example.com/x\n\ngo 1.22\n" });
assertFail(
  "version-pinned",
  {
    "platform-tooling-support-tests/projects/jupiter-starter/pom.xml":
      "<project><maven.compiler.release>17</maven.compiler.release></project>\n",
  },
);
assertFail(
  "version-pinned",
  {
    "platform-tooling-support-tests/projects/jupiter-starter/build.gradle.kts":
      "java { toolchain { languageVersion.set(JavaLanguageVersion.of(17)) } }\n",
  },
);
assertFail(
  "version-pinned",
  {
    "gradle/plugins/common/src/main/kotlin/junitbuild.java-toolchain-conventions.gradle.kts": "",
    "platform-tooling-support-tests/projects/jupiter-starter/pom.xml":
      "<project><maven.compiler.release>17</maven.compiler.release></project>\n",
    "platform-tooling-support-tests/projects/jupiter-starter/build.gradle.kts":
      "java { toolchain { languageVersion.set(JavaLanguageVersion.of(17)) } }\n",
  },
);
assertPass(
  "version-pinned",
  { "pom.xml": "<project><maven.compiler.source>17</maven.compiler.source></project>\n" },
  /maven\.compiler\.source/,
);
assertPass(
  "version-pinned",
  { "src/pom.xml": "<project><maven.compiler.release>17</maven.compiler.release></project>\n" },
  /maven\.compiler\.release/,
);
assertPass(
  "version-pinned",
  { "crates/foo-demo/Cargo.toml": '[package]\nname = "foo-demo"\nrust-version = "1.71"\n' },
  /rust-version/,
);
assertPass(
  "version-pinned",
  { "packages/my-sample-lib/pyproject.toml": '[project]\nrequires-python = ">=3.10"\n' },
  /requires-python/,
);
assertPass(
  "version-pinned",
  {
    "src/jupiter-starter/pom.xml":
      "<project><maven.compiler.release>17</maven.compiler.release></project>\n",
  },
  /maven\.compiler\.release/,
);
assertFail(
  "version-pinned",
  { "examples/foo/pyproject.toml": '[project]\nrequires-python = ">=3.10"\n' },
);
assertPass(
  "version-pinned",
  {
    "projects/lib/pom.xml":
      "<project><maven.compiler.release>17</maven.compiler.release></project>\n",
  },
  /maven\.compiler\.release/,
);
assertPass(
  "version-pinned",
  { "build.gradle.kts": "java { jvmToolchain(17) }\n" },
  /jvmToolchain/,
);
assertPass(
  "version-pinned",
  { "src/build.gradle.kts": "java { toolchain { languageVersion.set(JavaLanguageVersion.of(17)) } }\n" },
  /JavaLanguageVersion/,
);
assertPass(
  "version-pinned",
  { "build.gradle": "sourceCompatibility = 17\n" },
  /sourceCompatibility/,
);

assertPass("setup-script", { Gemfile: 'source "https://rubygems.org"\n' }, /Gemfile/);
assertPass("version-pinned", { Gemfile: 'ruby "3.2.0"\n' }, /ruby "/);
assertPass("version-pinned", { Gemfile: "ruby '3.2.0'\n" }, /ruby '/);
assertFail("version-pinned", { Gemfile: 'source "https://rubygems.org"\ngem "jekyll"\n' });
assertFail("version-pinned", { "testdata/Gemfile": 'ruby "3.2.0"\n' });
assertPass(
  "version-pinned",
  { "jekyll.gemspec": 's.required_ruby_version = ">= 2.7.0"\n' },
  /required_ruby_version/,
);
assertFail("version-pinned", { "jekyll.gemspec": 's.name = "jekyll"\n' });
assertFail(
  "version-pinned",
  { Gemfile: 'source "https://rubygems.org"\ngemspec :name => "jekyll"\n' },
);

assertPass("setup-script", { "mix.exs": "defmodule Plug.MixProject do\nend\n" }, /mix\.exs/);
assertPass(
  "version-pinned",
  { "mix.exs": "defmodule X do\n  def project, do: [app: :x, elixir: \"~> 1.14\"]\nend\n" },
  /elixir:/,
);
assertFail("version-pinned", { "mix.exs": "defmodule X do\nend\n" });
assertFail("version-pinned", { "fixtures/mix.exs": "defmodule X do\n  def project, do: [elixir: \"~> 1.14\"]\nend\n" });

assertPass("setup-script", { "composer.json": "{}\n" }, /composer\.json/);
assertPass(
  "version-pinned",
  { "composer.json": { require: { php: ">=8.1" } } },
  /"php":/,
);
assertFail("version-pinned", { "composer.json": { name: "nesbot/carbon" } });

assertPass("setup-script", { "Package.swift": "// swift-tools-version:5.9\n" }, /Package\.swift/);
assertPass(
  "version-pinned",
  { "Package.swift": "// swift-tools-version:5.9\nimport PackageDescription\n" },
  /swift-tools-version/,
);
assertFail("version-pinned", { "Package.swift": "import PackageDescription\n" });

assertPass("setup-script", { "Lib.csproj": "<Project></Project>\n" }, /\.csproj/);
assertPass("setup-script", { "Src/Lib/Lib.csproj": "<Project></Project>\n" }, /\.csproj/);
assertPass("setup-script", { "Src/Foo/Foo.csproj": "<Project></Project>\n" }, /\.csproj/);
assertPass(
  "setup-script",
  { "support/build.gradle": "apply plugin: \"com.android.library\"\n" },
  /support\/build\.gradle/,
);
const fmtLikeSetup = evalTree({
  "CMakeLists.txt": "cmake_minimum_required(VERSION 3.8)\nproject(FMT CXX)\n",
  "support/build.gradle": "apply plugin: \"com.android.library\"\n",
});
assert.equal(fmtLikeSetup["setup-script"].pass, true, fmtLikeSetup["setup-script"].message);
assert.match(fmtLikeSetup["setup-script"].message, /CMakeLists\.txt/);
assert.equal(/support\//.test(fmtLikeSetup["setup-script"].message), false, fmtLikeSetup["setup-script"].message);
assert.equal(fmtLikeSetup["test-script"].pass, false, fmtLikeSetup["test-script"].message);
const makefileOverSupport = evalTree({
  Makefile: "all:\n\t@echo ok\n",
  "support/build.gradle": "apply plugin: \"com.android.library\"\n",
});
assert.equal(makefileOverSupport["setup-script"].pass, true, makefileOverSupport["setup-script"].message);
assert.match(makefileOverSupport["setup-script"].message, /Makefile/);
assert.equal(/support\//.test(makefileOverSupport["setup-script"].message), false);
const packageJsonOverSupport = evalTree({
  "package.json": { scripts: { test: "node --test" } },
  "support/build.gradle": "apply plugin: \"com.android.library\"\n",
});
assert.equal(packageJsonOverSupport["setup-script"].pass, true, packageJsonOverSupport["setup-script"].message);
assert.match(packageJsonOverSupport["setup-script"].message, /scripts\.test/);
assert.equal(/support\//.test(packageJsonOverSupport["setup-script"].message), false);
const cmakeOverAndroid = evalTree({
  "CMakeLists.txt": "project(demo)\n",
  "android/build.gradle": "apply plugin: \"com.android.library\"\n",
});
assert.equal(cmakeOverAndroid["setup-script"].pass, true, cmakeOverAndroid["setup-script"].message);
assert.match(cmakeOverAndroid["setup-script"].message, /CMakeLists\.txt/);
assert.equal(/android\//.test(cmakeOverAndroid["setup-script"].message), false);
assertPass(
  "setup-script",
  { "android/build.gradle": "apply plugin: \"com.android.library\"\n" },
  /android\/build\.gradle/,
);
assertPass(
  "setup-script",
  { "examples/CMakeLists.txt": "project(demo)\n" },
  /examples\/CMakeLists\.txt/,
);
assertPass("setup-script", { "Foo.sln": "Microsoft Visual Studio Solution\n" }, /\.sln/);
assertFail("setup-script", { "deps/jemalloc/msvc/foo.sln": "Microsoft Visual Studio Solution\n" });
assertPass(
  "version-pinned",
  { "Src/Lib/Lib.csproj": "<Project><TargetFramework>net8.0</TargetFramework></Project>\n" },
  /TargetFramework/,
);
assertFail("version-pinned", { "Lib.csproj": "<Project></Project>\n" });

assertPass("setup-script", { "build.sbt": "name := \"cats\"\n" }, /build\.sbt/);
assertPass("version-pinned", { "build.sbt": "scalaVersion := \"2.13.12\"\n" }, /scalaVersion/);
assertFail("version-pinned", { "build.sbt": "name := \"cats\"\n" });

assertPass("version-pinned", { "stack.yaml": "resolver: lts-22.18\n" }, /resolver/);
assertFail("version-pinned", { "stack.yaml": "packages: []\n" });
assertPass("version-pinned", { "pandoc.cabal": "cabal-version: 2.4\nname: pandoc\n" }, /cabal-version:/);

assertPass(
  "version-pinned",
  { "CMakeLists.txt": "set(CMAKE_CXX_STANDARD 17)\nproject(json)\n" },
  /CMAKE_CXX_STANDARD/,
);
assertPass(
  "version-pinned",
  { "src/CMakeLists.txt": "set_property(TARGET x PROPERTY CXX_STANDARD 20)\n" },
  /PROPERTY CXX_STANDARD/,
);
assertPass(
  "version-pinned",
  { "src/CMakeLists.txt": "set_target_properties(x PROPERTIES CXX_STANDARD 20)\n" },
  /PROPERTIES CXX_STANDARD/,
);
assertFail("version-pinned", { "CMakeLists.txt": "project(json)\n" });
assertFail("version-pinned", { "docs/CMakeLists.txt": "set(CMAKE_CXX_STANDARD 17)\n" });
assertFail(
  "version-pinned",
  {
    "CMakeLists.txt": "cmake_minimum_required(VERSION 3.5)\nproject(json LANGUAGES CXX)\n",
    "tests/CMakeLists.txt":
      "json_test_set_test_options(all CXX_STANDARDS 17 LINK_LIBRARIES stdc++fs)\njson_test_add_test_for(src/unit.cpp MAIN test_main CXX_STANDARDS 11 14 17)\n",
  },
);
assertFail(
  "version-pinned",
  {
    "CMakeLists.txt":
      "function(json_test_add_test_for)\n  cmake_parse_arguments(args \"\" \"\" \"CXX_STANDARDS\" ${ARGN})\nendfunction()\n",
  },
);
assertPass(
  "version-pinned",
  {
    "CMakeLists.txt": "cmake_minimum_required(VERSION 3.8)\nproject(FMT CXX)\nset(CMAKE_CXX_STANDARD 11)\n",
    "src/format.cc": "int x;\n",
    "test/CMakeLists.txt": "add_test(NAME fmt COMMAND fmt_test)\n",
  },
  /CMAKE_CXX_STANDARD/,
);
assertPass(
  "version-pinned",
  {
    "CMakeLists.txt": "project(json LANGUAGES CXX)\n",
    "tests/CMakeLists.txt": "set(CMAKE_CXX_STANDARD 17)\n",
  },
  /CMAKE_CXX_STANDARD/,
);

const nlohmannLike = evalTree({
  "CMakeLists.txt": "cmake_minimum_required(VERSION 3.5)\nproject(json)\nset(CMAKE_CXX_STANDARD 11)\n",
  "include/nlohmann/json.hpp": "#pragma once\n",
  "Package.swift":
    "// swift-tools-version:5.0\nimport PackageDescription\nlet package = Package(name: \"nlohmann-json\")\n",
});
assert.equal(nlohmannLike["type-checker"].skipped, true, nlohmannLike["type-checker"].message);
assert.match(nlohmannLike["type-checker"].message, /no conventional type-checker file/i);
assert.equal(/Swift has a built-in static type system/.test(nlohmannLike["type-checker"].message), false);
assert.equal(nlohmannLike["version-pinned"].pass, true, nlohmannLike["version-pinned"].message);
assert.match(nlohmannLike["version-pinned"].message, /CMAKE_CXX_STANDARD/);
assert.equal(/Package\.swift/.test(nlohmannLike["version-pinned"].message), false);
assert.equal(nlohmannLike["setup-script"].pass, true, nlohmannLike["setup-script"].message);
assert.match(nlohmannLike["setup-script"].message, /CMakeLists\.txt/);

assertFail(
  "version-pinned",
  {
    "CMakeLists.txt": "project(json)\n",
    "src/json.cpp": "int x;\n",
    "Package.swift": "// swift-tools-version:5.0\nimport PackageDescription\n",
  },
);

const swiftPrimary = evalTree({
  "Package.swift": "// swift-tools-version:5.9\nimport PackageDescription\n",
  "Sources/Foo/Foo.swift": "public struct Foo {}\n",
});
assert.equal(swiftPrimary["setup-script"].pass, true, swiftPrimary["setup-script"].message);
assert.match(swiftPrimary["setup-script"].message, /Package\.swift/);
assert.equal(swiftPrimary["version-pinned"].pass, true, swiftPrimary["version-pinned"].message);
assert.match(swiftPrimary["version-pinned"].message, /swift-tools-version/);
assert.equal(swiftPrimary["type-checker"].pass, true, swiftPrimary["type-checker"].message);
assert.match(swiftPrimary["type-checker"].message, /Swift has a built-in static type system/);

const cppFiles = ["CMakeLists.txt", "include/nlohmann/json.hpp", "Package.swift"];
assert.equal(detectManifestLanguages(cppFiles).has("swift"), false);
assert.equal(detectLanguages(cppFiles).has("swift"), false);
assert.equal(detectLanguages(cppFiles).has("cpp"), true);
assert.equal(detectManifestLanguages(["Package.swift", "Sources/Foo/Foo.swift"]).has("swift"), true);
assert.equal(detectLanguages(["Package.swift", "Sources/Foo/Foo.swift"]).has("swift"), true);
assert.equal(detectManifestLanguages(["Package.swift"]).has("swift"), true);
assert.equal(detectLanguages(["Package.swift"]).has("swift"), true);

const laravelLike = evalTree({
  "composer.json": { require: { php: "^8.2" } },
  "src/Illuminate/Foundation/resources/exceptions/renderer/package.json": {
    private: true,
    engines: { node: ">=22.19.0" },
    scripts: { build: "vite build" },
  },
});
assert.equal(laravelLike["setup-script"].pass, true, laravelLike["setup-script"].message);
assert.match(laravelLike["setup-script"].message, /composer\.json/);
assert.equal(laravelLike["version-pinned"].pass, true, laravelLike["version-pinned"].message);
assert.match(laravelLike["version-pinned"].message, /composer\.json/);
assert.match(laravelLike["version-pinned"].message, /"php":/);
assert.equal(/package\.json/.test(laravelLike["version-pinned"].message), false);
assert.equal(/renderer/.test(laravelLike["version-pinned"].message), false);
assertFail(
  "version-pinned",
  {
    "src/Illuminate/Foundation/resources/exceptions/renderer/package.json": {
      engines: { node: ">=22.19.0" },
    },
  },
);

const alamofireLike = evalTree({
  "Package.swift": "// swift-tools-version:5.9\nimport PackageDescription\n",
  ".ruby-version": "2.7.0\n",
  "Source/Alamofire/AF.swift": "public struct AF {}\n",
});
assert.equal(alamofireLike["setup-script"].pass, true, alamofireLike["setup-script"].message);
assert.match(alamofireLike["setup-script"].message, /Package\.swift/);
assert.equal(alamofireLike["version-pinned"].pass, true, alamofireLike["version-pinned"].message);
assert.match(alamofireLike["version-pinned"].message, /swift-tools-version/);
assert.equal(/\.ruby-version/.test(alamofireLike["version-pinned"].message), false);
assert.equal(alamofireLike["type-checker"].pass, true, alamofireLike["type-checker"].message);
assert.match(alamofireLike["type-checker"].message, /Swift has a built-in static type system/);
assertPass("version-pinned", { ".ruby-version": "3.2.0\n" }, /\.ruby-version/);

assertPass("containerization", { "compose.yaml": "services: {}\n" }, /compose\.yaml/);
assertPass("containerization", { "compose.yml": "services: {}\n" }, /compose\.yml/);
assertPass("containerization", { Containerfile: "FROM alpine\n" }, /Containerfile/);
assertFail("containerization", { Makefile: "image:\n\tdocker build .\n" });
assertPass(
  "containerization",
  { ".cursor/environment.json": JSON.stringify({ install: "npm install" }) },
  /environment\.json/,
);
assertFail("containerization", { "environment.json": JSON.stringify({ install: "npm install" }) });
assertPass("containerization", { Dockerfile: "FROM node:20\n" }, /Dockerfile/);
assertPass(
  "containerization",
  { ".devcontainer/devcontainer.json": "{ \"image\": \"mcr.microsoft.com/devcontainers/javascript-node\" }\n" },
  /\.devcontainer/,
);
const nestBootAndIntegration = evalTree({
  ".devcontainer/devcontainer.json": "{ \"image\": \"mcr.microsoft.com/devcontainers/javascript-node\" }\n",
  "integration/docker-compose.yml": "services: {}\n",
});
assert.equal(nestBootAndIntegration.containerization.pass, true, nestBootAndIntegration.containerization.message);
assert.match(nestBootAndIntegration.containerization.message, /\.devcontainer/);
assert.equal(
  /integration/.test(nestBootAndIntegration.containerization.message),
  false,
  nestBootAndIntegration.containerization.message,
);
assertPass(
  "containerization",
  { "integration/docker-compose.yml": "services: {}\n" },
  /integration\/docker-compose\.yml/,
);
assertPass(
  "containerization",
  { "integration_test/docker-compose.yml": "services: {}\n" },
  /integration_test\/docker-compose\.yml/,
);
assertPass(
  "containerization",
  { "test/docker-compose.yml": "services: {}\n" },
  /test\/docker-compose\.yml/,
);
const envAndTestsCompose = evalTree({
  ".cursor/environment.json": JSON.stringify({ install: "npm install" }),
  "tests/docker-compose.yml": "services: {}\n",
});
assert.equal(envAndTestsCompose.containerization.pass, true, envAndTestsCompose.containerization.message);
assert.match(envAndTestsCompose.containerization.message, /\.cursor\/environment\.json/);
assert.equal(
  /tests\//.test(envAndTestsCompose.containerization.message),
  false,
  envAndTestsCompose.containerization.message,
);
const rootDockerAndIntegration = evalTree({
  Dockerfile: "FROM node:20\n",
  "integration/docker-compose.yml": "services: {}\n",
});
assert.equal(rootDockerAndIntegration.containerization.pass, true, rootDockerAndIntegration.containerization.message);
assert.match(rootDockerAndIntegration.containerization.message, /Found Dockerfile/);
assert.equal(
  /integration/.test(rootDockerAndIntegration.containerization.message),
  false,
  rootDockerAndIntegration.containerization.message,
);
const rootComposeAndTests = evalTree({
  "compose.yml": "services: {}\n",
  "tests/docker-compose.yml": "services: {}\n",
});
assert.equal(rootComposeAndTests.containerization.pass, true, rootComposeAndTests.containerization.message);
assert.match(rootComposeAndTests.containerization.message, /Found compose\.yml/);
assert.equal(
  /tests\//.test(rootComposeAndTests.containerization.message),
  false,
  rootComposeAndTests.containerization.message,
);
const nestBootSampleAndIntegration = evalTree({
  ".devcontainer/devcontainer.json": "{ \"image\": \"mcr.microsoft.com/devcontainers/javascript-node\" }\n",
  "sample/05-sql-typeorm/docker-compose.yml": "services: {}\n",
  "integration/docker-compose.yml": "services: {}\n",
});
assert.equal(
  nestBootSampleAndIntegration.containerization.pass,
  true,
  nestBootSampleAndIntegration.containerization.message,
);
assert.match(nestBootSampleAndIntegration.containerization.message, /\.devcontainer/);
assert.equal(
  /sample\//.test(nestBootSampleAndIntegration.containerization.message),
  false,
  nestBootSampleAndIntegration.containerization.message,
);
assert.equal(
  /integration/.test(nestBootSampleAndIntegration.containerization.message),
  false,
  nestBootSampleAndIntegration.containerization.message,
);
const nestSampleAndIntegration = evalTree({
  "sample/05-sql-typeorm/docker-compose.yml": "services: {}\n",
  "integration/docker-compose.yml": "services: {}\n",
});
assert.equal(nestSampleAndIntegration.containerization.pass, true, nestSampleAndIntegration.containerization.message);
assert.match(nestSampleAndIntegration.containerization.message, /integration\/docker-compose\.yml/);
assert.equal(
  /sample\//.test(nestSampleAndIntegration.containerization.message),
  false,
  nestSampleAndIntegration.containerization.message,
);
const sampleAndIntegrationSameDepth = evalTree({
  "sample/docker-compose.yml": "services: {}\n",
  "integration/docker-compose.yml": "services: {}\n",
});
assert.equal(
  sampleAndIntegrationSameDepth.containerization.pass,
  true,
  sampleAndIntegrationSameDepth.containerization.message,
);
assert.match(sampleAndIntegrationSameDepth.containerization.message, /integration\/docker-compose\.yml/);
assert.equal(
  /sample\//.test(sampleAndIntegrationSameDepth.containerization.message),
  false,
  sampleAndIntegrationSameDepth.containerization.message,
);
assertPass(
  "containerization",
  { "sample/05-sql-typeorm/docker-compose.yml": "services: {}\n" },
  /sample\/05-sql-typeorm\/docker-compose\.yml/,
);
assertPass(
  "containerization",
  { "examples/docker-compose.yml": "services: {}\n" },
  /examples\/docker-compose\.yml/,
);
const rootDockerAndSample = evalTree({
  Dockerfile: "FROM node:20\n",
  "sample/05-sql-typeorm/docker-compose.yml": "services: {}\n",
});
assert.equal(rootDockerAndSample.containerization.pass, true, rootDockerAndSample.containerization.message);
assert.match(rootDockerAndSample.containerization.message, /Found Dockerfile/);
assert.equal(
  /sample\//.test(rootDockerAndSample.containerization.message),
  false,
  rootDockerAndSample.containerization.message,
);

assertPass("ci-config", { "azure-pipelines.yml": "pool: vm\n" }, /azure-pipelines\.yml/);
assertPass("ci-config", { ".azure-pipelines/ci.yml": "pool: vm\n" }, /\.azure-pipelines/);
assertPass("ci-config", { "bitbucket-pipelines.yml": "pipelines: {}\n" }, /bitbucket-pipelines\.yml/);
assertPass("ci-config", { ".buildkite/pipeline.yml": "steps: []\n" }, /\.buildkite/);
assertPass("ci-config", { ".woodpecker.yml": "steps: {}\n" }, /\.woodpecker\.yml/);
assertPass("ci-config", { ".woodpecker/pr.yml": "steps: {}\n" }, /\.woodpecker/);
assertPass("ci-config", { ".drone.yml": "kind: pipeline\n" }, /\.drone\.yml/);
assertPass("ci-config", { "cloudbuild.yaml": "steps: []\n" }, /cloudbuild\.yaml/);
assertPass("ci-config", { "appveyor.yml": "build: off\n" }, /appveyor\.yml/);
assertFail("ci-config", { Makefile: "ci:\n\tnpm test\n" });

assertPass(
  "ci-runs-linters",
  { ".github/workflows/ci.yml": "run: biome check .\n" },
  /CI config matched/,
);
assertPass(
  "ci-runs-linters",
  { ".github/workflows/ci.yml": "run: golangci-lint run\n" },
  /CI config matched/,
);
assertFail("ci-runs-linters", { ".github/workflows/ci.yml": "run: prettier --check .\n" });

assertPass(
  "ci-runs-tests",
  {
    ".github/workflows/ci.yml": [
      "name: CI",
      "on: [push]",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: npx hereby test:tsc",
      "",
    ].join("\n"),
  },
  /CI config matched/,
);
assertPass(
  "ci-runs-tests",
  { ".github/workflows/ci.yml": "run: hereby test\n" },
  /CI config matched/,
);
assertFail("ci-runs-tests", {
  ".github/workflows/ci.yml": [
    "name: CI",
    "on: [push]",
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: npx hereby build",
    "",
  ].join("\n"),
});
assertPass(
  "ci-runs-tests",
  { ".github/workflows/ci.yml": "run: jest\n" },
  /CI config matched/,
);
assertPass(
  "ci-runs-tests",
  { ".github/workflows/ci.yml": "run: pytest\n" },
  /CI config matched/,
);
assertPass(
  "ci-runs-tests",
  { ".github/workflows/ci.yml": "run: go test ./...\n" },
  /CI config matched/,
);
assertPass(
  "ci-runs-tests",
  { ".github/workflows/ci.yml": "run: vitest\n" },
  /CI config matched/,
);
assertPass(
  "ci-runs-tests",
  { ".github/workflows/ci.yml": "run: mvn test\n" },
  /CI config matched/,
);

assertPass("dead-code-detection", { ".vulture": "# whitelist\n" }, /\.vulture/);
assertPass("dead-code-detection", { "pyproject.toml": "vulture = \"2.0\"\n" }, /vulture/);
assertPass("dead-code-detection", { "Cargo.toml": "cargo-machete = \"0.6\"\n" }, /cargo-machete/);
assertPass(
  "dead-code-detection",
  { ".github/workflows/ci.yml": "run: deadcode ./...\n" },
  /CI config matched/,
);
assertFail("dead-code-detection", { "README.md": "Remove unused code regularly.\n" });

assertPass(
  "bundle-analysis",
  { "package.json": { devDependencies: { "source-map-explorer": "5.0.0" } } },
  /source-map-explorer/,
);

assertPass("license", { "LICENSE.rst": "MIT License\n" }, /LICENSE\.rst/);
assertPass("license", { "LICENSES/MIT.txt": "MIT License\n" }, /LICENSES/);
assertPass("license", { "LICENSE.txt": "MIT License\n" }, /LICENSE\.txt/);
assertPass("license", { LICENSE: "MIT\n" }, /Found LICENSE/);
assertPass("license", { "LICENSE.md": "MIT License\n" }, /LICENSE\.md/);
assertPass("license", { COPYING: "GNU GENERAL PUBLIC LICENSE\n" }, /COPYING/);
assertPass("license", { "packages/app/LICENSE": "MIT\n" }, /packages\/app\/LICENSE/);
assertPass("license", { "examples/LICENSE": "MIT\n" }, /examples\/LICENSE/);
assertFail("license", { "deps/tre/LICENSE": "MIT\n" });
assertFail("license", { "vendor/foo/LICENSE": "MIT\n" });
assertFail("license", { "third_party/bar/LICENSE.md": "MIT License\n" });
assertFail("license", { "README.md": "[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)]()\n" });
const mixedVendorLic = evalTree({
  "deps/tre/LICENSE": "BSD\n",
  "LICENSE.txt": "Copyright (c) Redis Ltd.\n",
});
assert.equal(mixedVendorLic.license.pass, true, mixedVendorLic.license.message);
assert.match(mixedVendorLic.license.message, /LICENSE\.txt/);
assert.equal(/deps/.test(mixedVendorLic.license.message), false);
const mixedRootAndPkgLic = evalTree({
  "LICENSE.txt": "Apache-2.0\n",
  "packages/lib/LICENSE": "MIT\n",
});
assert.equal(mixedRootAndPkgLic.license.pass, true, mixedRootAndPkgLic.license.message);
assert.match(mixedRootAndPkgLic.license.message, /LICENSE\.txt/);
assert.equal(/packages/.test(mixedRootAndPkgLic.license.message), false);
const mixedRootCopyingAndPkgLic = evalTree({
  COPYING: "GNU GENERAL PUBLIC LICENSE\n",
  "packages/app/LICENSE": "MIT\n",
});
assert.equal(mixedRootCopyingAndPkgLic.license.pass, true, mixedRootCopyingAndPkgLic.license.message);
assert.match(mixedRootCopyingAndPkgLic.license.message, /COPYING/);
assert.equal(/packages/.test(mixedRootCopyingAndPkgLic.license.message), false);
assertPass("license", { "License.txt": "MIT License\n" }, /^Found License\.txt$/);
assertPass("license", { "Licence.md": "MIT License\n" }, /Licence\.md/);
assertPass("license", { license: "MIT\n" }, /^Found license$/);
assertPass("license", { "packages/app/License.txt": "MIT\n" }, /packages\/app\/License\.txt/);
assertFail("license", { "third_party/bar/License.txt": "MIT License\n" });
const mixedVendorLooseLic = evalTree({
  "vendor/foo/License.txt": "BSD\n",
  "License.txt": "MIT License\n",
});
assert.equal(mixedVendorLooseLic.license.pass, true, mixedVendorLooseLic.license.message);
assert.equal(/vendor/.test(mixedVendorLooseLic.license.message), false);
// The LICENSE-* glob stays case-sensitive so a credential file is not a license.
assertFail("license", { "license-key.txt": "sekrit\n" });
assertFail("license", { "licenses/notes.txt": "third party notes\n" });
// Case-insensitive doc names must not reach ids where casing is semantic.
assertFail("setup-script", { makefile: "setup:\n\techo hi\n" });
assertFail("version-pinned", { "package.swift": "// swift-tools-version:5.9\n" });

const twoNestedLic = evalTree({
  "docs/LICENSE": "MIT\n",
  "packages/app/nested/LICENSE": "MIT\n",
});
assert.equal(twoNestedLic.license.pass, true, twoNestedLic.license.message);
assert.match(twoNestedLic.license.message, /docs\/LICENSE/);
assert.equal(/packages/.test(twoNestedLic.license.message), false);

assertPass("security-policy", { "docs/SECURITY.md": "# Security\n" }, /docs\/SECURITY\.md/);
assertPass("security-policy", { "security.md": "# Security\n" }, /security\.md/);

assertPass("dep-update-automation", { "renovate.json5": "{}\n" }, /renovate\.json5/);
assertPass("dep-update-automation", { ".github/renovate.json": "{}\n" }, /\.github\/renovate\.json/);

assertPass("security-scanning", { "semgrep.yml": "rules: []\n" }, /semgrep\.yml/);
assertPass("security-scanning", { ".semgrep.yml": "rules: []\n" }, /\.semgrep\.yml/);
assertPass("security-scanning", { "bandit.yaml": "skips: []\n" }, /bandit\.yaml/);
assertPass("security-scanning", { ".bandit": "[bandit]\n" }, /\.bandit/);
assertPass(
  "security-scanning",
  { ".github/workflows/ci.yml": "run: gosec ./...\n" },
  /CI config matched/,
);
assertPass(
  "security-scanning",
  { ".github/workflows/ci.yml": "run: govulncheck ./...\n" },
  /CI config matched/,
);
assertFail("security-scanning", { "README.md": "We take security seriously.\n" });

assertPass("secrets-detection", { ".gitleaks.yml": "title: gitleaks\n" }, /\.gitleaks\.yml/);
assertPass("secrets-detection", { ".detect-secrets.cfg": "[plugins]\n" }, /\.detect-secrets\.cfg/);
assertPass("secrets-detection", { ".gitguardian.yml": "version: 2\n" }, /\.gitguardian\.yml/);
assertFail("secrets-detection", { "README.md": "We run gitleaks in CI.\n" });

const canvasTemplate = fs.readFileSync(
  path.join(skillRoot(), "canvas", "code-readiness.canvas.tsx"),
  "utf8",
);
assert.match(canvasTemplate, /from "cursor\/canvas"/);
assert.equal(
  /from ["'](?!cursor\/canvas)/.test(canvasTemplate),
  false,
  "canvas must import only from cursor/canvas",
);
assert.match(canvasTemplate, /LineChart/);
assert.match(canvasTemplate, /computeDAGLayout/);
assert.match(canvasTemplate, /\bLink\b/);
assert.match(canvasTemplate, /TextInput/);
assert.match(canvasTemplate, /Checkbox/);
assert.equal(canvasTemplate.includes("RadarChart"), false);
assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(canvasTemplate), false);
assert.equal(/linear-gradient|radial-gradient/.test(canvasTemplate), false);
assert.match(canvasTemplate, /WHY_FOR_AGENTS/);
assert.match(canvasTemplate, /agent-runnable style oracle/);
assert.match(canvasTemplate, /only when there is no linter/);
assert.match(canvasTemplate, /Documented/);
assert.equal(/Foundational|Guided/.test(canvasTemplate), false);
assert.match(canvasTemplate, /function remainingGateFails/);
assert.match(canvasTemplate, /function rankedFixRows/);
assert.match(canvasTemplate, /Would be \$\{band\.nextLevelLabel\}/);
assert.match(canvasTemplate, /except \$\{joinIds\(ids\)\}/);
assert.match(canvasTemplate, /band\.l1Capped/);
assert.match(canvasTemplate, /l1CapReasons/);
assert.match(canvasTemplate, /\.slice\(\s*0,\s*5\s*\)/);
assert.match(canvasTemplate, /\$\{row\.criterionId\} — add \$\{file\}/);
assert.match(canvasTemplate, /type: "openFile"/);
assert.equal(
  /Need \$\{band\.nextLevelRemaining\} more Level/.test(canvasTemplate),
  false,
  "callout must name remaining fail ids, not a generic need-N-more line",
);
assert.match(canvasTemplate, /\.\.\.gate\.slice\(\)\.sort\(byFileThenCatalog\)/);
assert.match(canvasTemplate, /\.\.\.rest\.slice\(\)\.sort\(byFileThenCatalog\)/);
assert.match(canvasTemplate, /"pre-commit-hooks": "\.pre-commit-config\.yaml"/);
assert.match(canvasTemplate, /"architecture-docs": "ARCHITECTURE\.md"/);
assert.equal(
  /"version-pinned": "\.nvmrc"/.test(canvasTemplate),
  false,
  "OPEN_BY_ID must not map version-pinned to .nvmrc",
);
assert.equal(
  /"type-checker": "tsconfig\.json"/.test(canvasTemplate),
  false,
  "OPEN_BY_ID must not map type-checker to tsconfig.json",
);
assert.match(canvasTemplate, /const OPEN_BY_LANG/);
assert.match(canvasTemplate, /function reportLanguages/);
assert.match(canvasTemplate, /const WHY_FOR_AGENTS/);
assert.match(canvasTemplate, /Why agents care/);
assert.match(canvasTemplate, /No counted gaps\./);
assert.match(canvasTemplate, /countedPillarFails/);
assert.match(canvasTemplate, /Category breakdown/);
assert.match(
  canvasTemplate,
  /Agents generate code that looks right/,
  "pillar Cards must render a technical why-for-agents sentence",
);
assert.match(canvasTemplate, /containerization: "\.devcontainer\/devcontainer\.json"/);
assert.match(canvasTemplate, /"\.cursor\/environment\.json"/);
assert.match(canvasTemplate, /"Dockerfile"/);
assert.match(
  canvasTemplate,
  /Cursor Cloud Agent `\.cursor\/environment\.json`/,
);
assert.match(canvasTemplate, /root `environment\.json` is not a hit/);

const canvasTopLevelBindings = [
  ...canvasTemplate.matchAll(
    /^(?:export\s+(?:default\s+)?)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm,
  ),
].map((match) => match[1]);
assert.ok(canvasTopLevelBindings.length > 10);
const canvasDuplicateBindings = [
  ...new Set(
    canvasTopLevelBindings.filter(
      (name, index) => canvasTopLevelBindings.indexOf(name) !== index,
    ),
  ),
];
assert.deepEqual(
  canvasDuplicateBindings,
  [],
  `canvas template redeclares top-level binding(s): ${canvasDuplicateBindings.join(", ")}. A duplicate const is a module-load SyntaxError, so the canvas never renders.`,
);
assert.equal(
  (canvasTemplate.match(/^const WHY_FOR_AGENTS: Record<string, string> = \{/gm) ?? [])
    .length,
  1,
  "WHY_FOR_AGENTS must be declared exactly once",
);
const whyForAgentsBlock = canvasTemplate.slice(
  canvasTemplate.indexOf("const WHY_FOR_AGENTS: Record<string, string> = {"),
  canvasTemplate.indexOf("const WHY_FOR_AGENTS_FALLBACK"),
);
for (const key of [
  "editorconfig:",
  "linter:",
  '"test-files-exist":',
  '"branch-protection":',
  "license:",
  '"coverage-config":',
  '"security-policy":',
  '"issue-templates":',
  '"naming-conventions":',
  '"docs-agent-friendliness":',
]) {
  assert.ok(
    whyForAgentsBlock.includes(key),
    `surviving WHY_FOR_AGENTS map lost ${key}`,
  );
}

function parseTsStringRecord(source, constName) {
  const header = `const ${constName}: Record<string, string> = {`;
  const start = source.indexOf(header);
  assert.ok(start >= 0, `missing ${constName}`);
  let i = start + header.length;
  let depth = 1;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") depth -= 1;
    i += 1;
  }
  const body = source.slice(start + header.length, i - 1);
  const out = {};
  const re =
    /(?:^|\n)\s*(?:([A-Za-z_][\w]*)|"([^"]+)")\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = re.exec(body))) {
    out[match[1] || match[2]] = match[3];
  }
  return out;
}

function parseTsStringArray(source, constName) {
  const header = `const ${constName} = [`;
  const start = source.indexOf(header);
  assert.ok(start >= 0, `missing ${constName}`);
  const end = source.indexOf("];", start);
  return [...source.slice(start, end).matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function parseTsNestedStringRecord(source, constName) {
  const header = `const ${constName}: Record<string, Record<string, string>> = {`;
  const start = source.indexOf(header);
  assert.ok(start >= 0, `missing ${constName}`);
  let i = start + header.length;
  let depth = 1;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") depth -= 1;
    i += 1;
  }
  const body = source.slice(start + header.length, i - 1);
  const out = {};
  let current = null;
  const re =
    /(?:^|\n)\s*(?:([A-Za-z_][\w]*)|"([^"]+)")\s*:\s*(?:\{|"((?:\\.|[^"\\])*)")/g;
  let match;
  while ((match = re.exec(body))) {
    const key = match[1] || match[2];
    if (match[3] != null) {
      assert.ok(current, `${constName} value before nested key`);
      out[current][key] = match[3];
    } else {
      current = key;
      out[current] = {};
    }
  }
  return out;
}

function pickLangPath(byLang, languages, langOrder) {
  if (languages.length === 0) return undefined;
  const known = new Set(languages);
  for (const lang of langOrder) {
    if (known.has(lang) && Object.hasOwn(byLang, lang)) return byLang[lang];
  }
  return null;
}

function simulateFailOpenPath(
  row,
  openById,
  concretePaths,
  languages = [],
  openByLang = {},
  langOrder = [],
) {
  const byLang = openByLang[row.criterionId];
  if (byLang) {
    const picked = pickLangPath(byLang, languages, langOrder);
    if (picked !== undefined) return picked;
  }
  const mapped = openById[row.criterionId];
  if (mapped) {
    if (byLang && languages.length > 0) return null;
    return mapped;
  }
  const blob = `${row.name} ${row.message} ${row.fix ?? ""} ${row.details ?? ""}`;
  return concretePaths.find((file) => blob.includes(file)) ?? null;
}

const whyMap = parseTsStringRecord(canvasTemplate, "WHY_FOR_AGENTS");
const whyFallbackMatch = canvasTemplate.match(
  /const WHY_FOR_AGENTS_FALLBACK =\s*"([^"]+)"/,
);
assert.ok(whyFallbackMatch, "WHY_FOR_AGENTS_FALLBACK must remain as unused catalog safety");
const whyFallback = whyFallbackMatch[1];
assert.equal(
  Object.keys(whyMap).length,
  catalog.criteria.length,
  "WHY_FOR_AGENTS must cover every catalog criterion id",
);
for (const criterion of catalog.criteria) {
  assert.ok(
    Object.hasOwn(whyMap, criterion.id),
    `WHY_FOR_AGENTS missing ${criterion.id}`,
  );
  assert.notEqual(
    whyMap[criterion.id],
    whyFallback,
    `${criterion.id} still uses the generic WHY fallback`,
  );
  assert.match(
    whyMap[criterion.id],
    /agent/i,
    `${criterion.id} WHY must say why a coding agent fails without this file`,
  );
}

const openById = parseTsStringRecord(canvasTemplate, "OPEN_BY_ID");
const openByLang = parseTsNestedStringRecord(canvasTemplate, "OPEN_BY_LANG");
const langOrder = parseTsStringArray(canvasTemplate, "LANG_ORDER");
const concretePaths = parseTsStringArray(canvasTemplate, "CONCRETE_PATHS");
assert.equal(
  openById["version-pinned"],
  ".mise.toml",
  "version-pinned conventional file is catalog anyFiles .mise.toml, not .nvmrc",
);
assert.equal(openById["type-checker"], undefined);
assert.equal(openById["ai-context"], "AGENTS.md");
assert.equal(openById["issue-templates"], ".github/ISSUE_TEMPLATE.md");
assert.equal(openById.containerization, ".devcontainer/devcontainer.json");
assert.ok(concretePaths.includes(".cursor/environment.json"));
assert.equal(openById.linter, "eslint.config.js");
assert.equal(openByLang.linter.go, ".golangci.yml");
assert.equal(openByLang.linter.elixir, ".credo.exs");
assert.equal(openByLang.linter.rust, "clippy.toml");
assert.equal(openByLang.linter.c, ".clang-tidy");
assert.notEqual(
  simulateFailOpenPath(
    { criterionId: "linter", name: "", message: "", fix: "", details: "" },
    openById,
    concretePaths,
    ["go"],
    openByLang,
    langOrder,
  ),
  "eslint.config.js",
  "Go remaining-fail must not recommend eslint.config.js",
);
assert.notEqual(
  simulateFailOpenPath(
    { criterionId: "linter", name: "", message: "", fix: "", details: "" },
    openById,
    concretePaths,
    ["elixir"],
    openByLang,
    langOrder,
  ),
  "eslint.config.js",
  "Elixir remaining-fail must not recommend eslint.config.js",
);
assert.equal(
  simulateFailOpenPath(
    { criterionId: "linter", name: "", message: "", fix: "", details: "" },
    openById,
    concretePaths,
    ["go"],
    openByLang,
    langOrder,
  ),
  ".golangci.yml",
);
assert.equal(
  simulateFailOpenPath(
    { criterionId: "linter", name: "", message: "", fix: "", details: "" },
    openById,
    concretePaths,
    ["elixir"],
    openByLang,
    langOrder,
  ),
  ".credo.exs",
);
assert.equal(
  simulateFailOpenPath(
    { criterionId: "formatter", name: "", message: "", fix: "", details: "" },
    openById,
    concretePaths,
    ["go"],
    openByLang,
    langOrder,
  ),
  null,
  "Go formatter is gofmt; do not recommend .prettierrc",
);
for (const criterion of catalog.criteria) {
  if (criterion.requiresLLM) continue;
  const hasAnyFiles = (criterion.anyFiles ?? []).length > 0;
  const hasConventionalFix =
    Boolean(criterion.ciFiles) ||
    Boolean(criterion.ciGrep) ||
    Boolean(criterion.lockFileFreshDays) ||
    Boolean(criterion.packageJsonPath) ||
    Boolean(criterion.makefileTarget) ||
    concretePaths.some((file) => (criterion.fix ?? "").includes(file));
  if (!hasAnyFiles && !hasConventionalFix) continue;
  const file = simulateFailOpenPath(
    {
      criterionId: criterion.id,
      name: criterion.name,
      message: criterion.fail,
      fix: criterion.fix,
      details: "",
    },
    openById,
    concretePaths,
    [],
    openByLang,
    langOrder,
  );
  assert.ok(
    file,
    `${criterion.id} remaining-fail Card must name a file from anyFiles / conventional fix`,
  );
}

const exampleCanvasFiles = fs
  .readdirSync(path.join(skillRoot(), "examples"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) =>
    path.join(skillRoot(), "examples", entry.name, "code-readiness.canvas.tsx"),
  )
  .filter((file) => fs.existsSync(file));
assert.ok(exampleCanvasFiles.length >= 20);
for (const file of exampleCanvasFiles) {
  assert.equal(
    fs.readFileSync(file, "utf8"),
    canvasTemplate,
    `${file} drifted from canvas/code-readiness.canvas.tsx`,
  );
}

const rootReadme = fs.readFileSync(path.join(skillRoot(), "README.md"), "utf8");
assert.equal((rootReadme.match(/issue-templates/g) ?? []).length, 1);
assert.match(rootReadme, /First-hit prefers a form/);
assert.match(rootReadme, /config\.yml-only tree still passes/);
assert.match(rootReadme, /PR-template-only tree still passes/);
assert.match(rootReadme, /`AGENTS\.md` is the preferred first-hit when both `AGENTS\.md` and `CLAUDE\.md` exist/);
assert.match(rootReadme, /`containerization` first-hit prefers/);
assert.match(rootReadme, /integration-only tree still passes/);
assert.match(rootReadme, /sample-only tree still passes/);
assert.match(rootReadme, /shallowest leftover/);
assert.match(rootReadme, /`setup-script` first-hit prefers/);
assert.match(rootReadme, /support-only tree still passes/);
assert.match(rootReadme, /modules-only tree still passes/);
assert.match(rootReadme, /lib\/foo\/modules\/setup\.py/);
assert.match(rootReadme, /`setup-script` first-hit among/);
assert.match(rootReadme, /Console-only/);
assert.match(rootReadme, /Fuzz-only or Tests-only tree still passes/);
assert.match(rootReadme, /`test-script` first-hit among/);
assert.match(rootReadme, /Fuzz-only tree still passes/);
assert.match(rootReadme, /`test-framework` first-hit among/);
assert.match(rootReadme, /A coverage-only or integration-only tree still passes/);
assert.match(rootReadme, /Mix\/Elixir-primary/);
assert.match(rootReadme, /A JS-only jest tree still passes/);
assert.match(rootReadme, /A Mix tree with only jest/);
assert.match(rootReadme, /A Rails tree with only jest/);
assert.match(rootReadme, /Python-primary/);
assert.match(rootReadme, /A Python tree with only jest/);
assert.match(rootReadme, /`test-framework` also passes on/);
assert.match(rootReadme, /Product `Foo\.csproj` is not a framework/);
assert.match(rootReadme, /`node -- --test`/);
assert.match(rootReadme, /`linter` first-hit prefers/);
assert.match(rootReadme, /A golangci-only tree still passes/);
assert.match(rootReadme, /`formatter` first-hit prefers/);
assert.match(rootReadme, /A Mix tree with only prettier/);
assert.match(rootReadme, /A Rails tree with only prettier/);
assert.match(rootReadme, /A Python tree with only prettier/);
assert.match(rootReadme, /A JS-only prettier tree still passes/);
assert.match(rootReadme, /`test-files-exist` first-hit prefers/);
assert.match(rootReadme, /A Go-only test tree still passes/);
assert.match(rootReadme, /A Mix tree with only JS tests still passes/);
assert.match(rootReadme, /A Rails tree with only JS tests still passes/);
assert.match(rootReadme, /A Python tree with only JS tests still passes/);
assert.match(rootReadme, /Python-primary/);
assert.match(rootReadme, /A Java tree with only JS tests still passes/);
assert.match(rootReadme, /Java-primary/);
assert.match(rootReadme, /A Java tree with only Python tests still passes/);
assert.match(rootReadme, /src\/test\/java\/FooTest\.java/);
assert.match(rootReadme, /src\/jvmTest/);
assert.match(rootReadme, /foo\/src\/jvmTest\/java\/FooTest\.java/);
assert.match(rootReadme, /foo-tls\/src\/test\/java\/TlsTest\.java/);
assert.match(rootReadme, /A jvmTest-only tree still passes/);
assert.match(rootReadme, /do not prefer `src\/test` over `src\/jvmTest`/);
assert.match(rootReadme, /A testlib-only tree still passes/);
assert.match(rootReadme, /foo-testlib/);
assert.match(rootReadme, /packages\/foo\/test\/foo\.spec\.ts/);
assert.match(rootReadme, /integration\/cors\/e2e\/express\.spec\.ts/);
assert.match(rootReadme, /integration\/auto-mock/);
assert.match(rootReadme, /e2e-only tree still passes/);
assert.match(rootReadme, /A C# tree with only JS tests still passes/);
assert.match(rootReadme, /C#-primary/);
assert.match(rootReadme, /A C# tree with only jest/);
assert.match(rootReadme, /A Go tree with only JS tests still passes/);
assert.match(rootReadme, /A Go tree with only jest/);
assert.match(rootReadme, /A benchmark-only tree still passes/);
assert.match(rootReadme, /tests\/FooTests\.cs/);
assert.match(rootReadme, /`type-checker` first-hit among/);
assert.match(rootReadme, /A test-only tree still passes/);
assert.match(rootReadme, /A fixtures-only or testdata-only tree still passes/);
assert.match(rootReadme, /A plugin-only tree still passes/);
assert.match(rootReadme, /A playground-only tree still passes/);
assert.match(rootReadme, /packages\/eslint-plugin-foo/);
assert.match(rootReadme, /compiler\/packages\/foo\/tsconfig\.json/);
assert.match(rootReadme, /compiler\/apps\/playground/);
assert.equal(/Style & Linting/.test(rootReadme), false);

const skillMd = fs.readFileSync(path.join(skillRoot(), "SKILL.md"), "utf8");
assert.match(skillMd, /1 Functional, 2 Documented, 3 Standardized, 4 Optimized, 5 Autonomous/);
assert.match(skillMd, /one repository/);
assert.match(skillMd, /honesty gate/);
assert.match(skillMd, /would be Documented except/);
assert.match(skillMd, /gate-ranked/);
assert.match(skillMd, /remaining fails at `nextLevel` first/);
assert.match(skillMd, /category breakdown/);
assert.match(skillMd, /why it helps agents/);
assert.match(skillMd, /Every catalog criterion has a technical/);
assert.match(skillMd, /Remaining fails name a concrete file/);
assert.match(skillMd, /only for when `l1Capped` is true/);
assert.match(skillMd, /prescriptive linter/);
assert.match(skillMd, /WHY_FOR_AGENTS/);
assert.match(skillMd, /Do not dummy `\.editorconfig`/);
assert.match(skillMd, /criterion \+ file/);
assert.match(skillMd, /never lead with `\.editorconfig` when `linter` is the L1 fail/);
assert.equal((skillMd.match(/issue-templates/g) ?? []).length, 1);
assert.match(skillMd, /First-hit prefers a form/);
assert.match(skillMd, /config\.yml-only tree still passes/);
assert.match(skillMd, /PR-template-only tree still passes/);
assert.match(skillMd, /`containerization` first-hit prefers/);
assert.match(skillMd, /integration-only tree still passes/);
assert.match(skillMd, /sample-only tree still passes/);
assert.match(skillMd, /shallowest leftover/);
assert.match(skillMd, /`setup-script` first-hit prefers/);
assert.match(skillMd, /support-only tree still passes/);
assert.match(skillMd, /modules-only tree still passes/);
assert.match(skillMd, /lib\/foo\/modules\/setup\.py/);
assert.match(skillMd, /`setup-script` first-hit among/);
assert.match(skillMd, /Console-only/);
assert.match(skillMd, /Fuzz-only or Tests-only tree still passes/);
assert.match(skillMd, /`test-script` first-hit among/);
assert.match(skillMd, /Fuzz-only tree still passes/);
assert.match(skillMd, /`test-framework` first-hit among/);
assert.match(skillMd, /A coverage-only or integration-only tree still passes/);
assert.match(skillMd, /Mix\/Elixir-primary/);
assert.match(skillMd, /A JS-only jest tree still passes/);
assert.match(skillMd, /A Mix tree with only jest/);
assert.match(skillMd, /A Rails tree with only jest/);
assert.match(skillMd, /Python-primary/);
assert.match(skillMd, /A Python tree with only jest/);
assert.match(skillMd, /`test-framework` also passes on/);
assert.match(skillMd, /Product `Foo\.csproj` is not a framework/);
assert.match(skillMd, /`node -- --test`/);
assert.match(skillMd, /`linter` first-hit prefers/);
assert.match(skillMd, /A golangci-only tree still passes/);
assert.match(skillMd, /`formatter` first-hit prefers/);
assert.match(skillMd, /A Mix tree with only prettier/);
assert.match(skillMd, /A Rails tree with only prettier/);
assert.match(skillMd, /A Python tree with only prettier/);
assert.match(skillMd, /A JS-only prettier tree still passes/);
assert.match(skillMd, /`test-files-exist` first-hit prefers/);
assert.match(skillMd, /A Go-only test tree still passes/);
assert.match(skillMd, /A Mix tree with only JS tests still passes/);
assert.match(skillMd, /A Rails tree with only JS tests still passes/);
assert.match(skillMd, /A Python tree with only JS tests still passes/);
assert.match(skillMd, /Python-primary/);
assert.match(skillMd, /A Java tree with only JS tests still passes/);
assert.match(skillMd, /Java-primary/);
assert.match(skillMd, /A Java tree with only Python tests still passes/);
assert.match(skillMd, /src\/test\/java\/FooTest\.java/);
assert.match(skillMd, /src\/jvmTest/);
assert.match(skillMd, /foo\/src\/jvmTest\/java\/FooTest\.java/);
assert.match(skillMd, /foo-tls\/src\/test\/java\/TlsTest\.java/);
assert.match(skillMd, /A jvmTest-only tree still passes/);
assert.match(skillMd, /do not prefer `src\/test` over `src\/jvmTest`/);
assert.match(skillMd, /A testlib-only tree still passes/);
assert.match(skillMd, /foo-testlib/);
assert.match(skillMd, /packages\/foo\/test\/foo\.spec\.ts/);
assert.match(skillMd, /integration\/cors\/e2e\/express\.spec\.ts/);
assert.match(skillMd, /integration\/auto-mock/);
assert.match(skillMd, /e2e-only tree still passes/);
assert.match(skillMd, /A C# tree with only JS tests still passes/);
assert.match(skillMd, /C#-primary/);
assert.match(skillMd, /A C# tree with only jest/);
assert.match(skillMd, /A Go tree with only JS tests still passes/);
assert.match(skillMd, /A Go tree with only jest/);
assert.match(skillMd, /A benchmark-only tree still passes/);
assert.match(skillMd, /tests\/FooTests\.cs/);
assert.match(skillMd, /`type-checker` first-hit among/);
assert.match(skillMd, /A test-only tree still passes/);
assert.match(skillMd, /A fixtures-only or testdata-only tree still passes/);
assert.match(skillMd, /A plugin-only tree still passes/);
assert.match(skillMd, /A playground-only tree still passes/);
assert.match(skillMd, /packages\/eslint-plugin-foo/);
assert.match(skillMd, /compiler\/packages\/foo\/tsconfig\.json/);
assert.match(skillMd, /compiler\/apps\/playground/);
assert.match(skillMd, /Style & Validation/);
assert.match(skillMd, /catalog id stays `style-linting`/);
assert.match(skillMd, /Forbidden UI copy: "9 pillars"/);
assert.equal(/Style & Linting/.test(skillMd), false);
assert.equal(/Foundational|Guided/.test(skillMd), false);
assert.equal(/Nest is that shape|L2 10\/13/.test(skillMd), false);
assert.equal(
  /failing L1 ids \(`l1CapReasons`\)/.test(skillMd),
  false,
  "would-be-except must name remaining fail ids, not l1CapReasons",
);

const canvasMd = fs.readFileSync(path.join(skillRoot(), "canvas", "CANVAS.md"), "utf8");
assert.match(canvasMd, /what band, what unblocks the next sequential gate, which files/);
assert.match(canvasMd, /why each gap helps coding agents/);
assert.match(canvasMd, /would be Documented except/);
assert.match(canvasMd, /`nextLevel` fails first/);
assert.match(canvasMd, /category breakdown/);
assert.match(canvasMd, /Every catalog criterion has a technical/);
assert.match(canvasMd, /Remaining counted fails name a concrete file/);
assert.match(canvasMd, /language-honest/);
assert.match(canvasMd, /AGENTS\.md/);
assert.match(canvasMd, /Style & Validation \(`style-linting`\)/);
assert.equal(/Style & Linting/.test(canvasMd), false);
assert.equal(/Style & Linting/.test(canvasTemplate), false);

const checksReadme = fs.readFileSync(path.join(skillRoot(), "checks", "README.md"), "utf8");
assert.equal((checksReadme.match(/issue-templates/g) ?? []).length, 1);
assert.match(checksReadme, /First-hit prefers a form/);
assert.match(checksReadme, /config\.yml-only tree still passes/);
assert.match(checksReadme, /PR-template-only tree still passes/);
assert.match(checksReadme, /empty `\.github\/ISSUE_TEMPLATE\/` directory is not a hit/);
assert.match(checksReadme, /Style & Validation \(`style-linting`\)/);
assert.equal(/Style & Linting/.test(checksReadme), false);
assert.match(checksReadme, /would be L2 except/);
assert.match(checksReadme, /L2 fail ids/);
assert.match(checksReadme, /not `l1CapReasons`/);
assert.match(checksReadme, /language-native/);
assert.match(checksReadme, /prescriptive linter/);
assert.match(checksReadme, /Do not dummy `\.editorconfig`/);
assert.match(checksReadme, /ESLint and Biome are both first-class JS\/TS linters/);
assert.match(checksReadme, /golangci-lint/);
assert.match(checksReadme, /\.toml/);
assert.match(checksReadme, /containerization.*also passes on `\.cursor\/environment\.json`/);
assert.match(checksReadme, /root `environment\.json` does not count/);
assert.match(checksReadme, /First-hit prefers `\.devcontainer`/);
assert.match(checksReadme, /integration\/docker-compose\.yml/);
assert.match(checksReadme, /sample\/05-sql-typeorm\/docker-compose\.yml/);
assert.match(checksReadme, /integration-only or tests-only compose still passes/);
assert.match(checksReadme, /sample-only tree still passes/);
assert.match(checksReadme, /shallowest leftover/);
assert.match(checksReadme, /any walked path with that basename/);
assert.match(checksReadme, /skip signals stay repository-root only/);
assert.match(checksReadme, /IGNORE_DIRS/);
assert.match(checksReadme, /\*\.gradle\.kts/);
assert.match(checksReadme, /empty asdf\/nvm files do not count/);
assert.match(checksReadme, /Empty formatter configs do not count/);
assert.match(checksReadme, /\.formatter\.exs/);
assert.match(checksReadme, /Do not auto-pass `formatter` merely because `mix\.exs` exists/);
assert.match(checksReadme, /Empty or whitespace-only files do not count/);
assert.match(checksReadme, /deps.*vendor.*third_party.*third-party/);
assert.match(checksReadme, /examples\/\.prettierrc` still can/);
assert.match(checksReadme, /`license` matches LICENSE/);
assert.match(checksReadme, /shallowest/);
assert.match(checksReadme, /packages\/\*\/LICENSE/);
assert.match(checksReadme, /eslint\.config\.js/);
assert.match(checksReadme, /tests\/fixtures/);
assert.match(checksReadme, /assets/);
assert.match(checksReadme, /tests\/format/);
assert.match(checksReadme, /Formatter first-hit is the shallowest product-tree/);
assert.match(checksReadme, /prettier\.config\.js/);
assert.match(checksReadme, /tests\/integration/);
assert.match(checksReadme, /docs samples/);
assert.match(checksReadme, /assets-only/);
assert.match(checksReadme, /packages-only linter/);
assert.match(checksReadme, /Do not reject empty linter configs/);
assert.match(checksReadme, /eslint\.config\.\*/);
assert.match(checksReadme, /match the basename at any depth for `linter`, `formatter`, and `test-framework`/);
assert.match(checksReadme, /`AGENTS\.md` is the preferred first-hit when both `AGENTS\.md` and `CLAUDE\.md` exist/);
assert.match(checksReadme, /`test-framework` first-hit prefers the shallowest product-tree/);
assert.match(checksReadme, /sample \/ examples \/ docs samples/);
assert.match(checksReadme, /vitest\.config\.coverage\.mts/);
assert.match(checksReadme, /A coverage-only or integration-only tree still passes/);
assert.match(checksReadme, /`type-checker` first-hit among `tsconfig\.json` \/ `jsconfig\.json`/);
assert.match(checksReadme, /packages\/foo\/tsconfig\.json/);
assert.match(checksReadme, /A test-only tree still passes/);
assert.match(checksReadme, /A fixtures-only or testdata-only tree still passes/);
assert.match(checksReadme, /A plugin-only tree still passes/);
assert.match(checksReadme, /A playground-only tree still passes/);
assert.match(checksReadme, /packages\/eslint-plugin-foo/);
assert.match(checksReadme, /compiler\/packages\/foo\/tsconfig\.json/);
assert.match(checksReadme, /compiler\/apps\/playground/);
assert.match(checksReadme, /root-anchored/);
assert.match(checksReadme, /Do not ignore `examples`/);
assert.match(checksReadme, /Do not skip `formatter` merely because a linter exists/);
assert.match(checksReadme, /C\+\+\/CMake-dominant/);
assert.match(checksReadme, /SPM sidecar/);
assert.match(checksReadme, /mix\.exs/);
assert.match(checksReadme, /composer\.json/);
assert.match(checksReadme, /Gemfile/);
assert.match(checksReadme, /build\.sbt/);
assert.match(checksReadme, /swift-tools-version/);
assert.match(checksReadme, /CMAKE_CXX_STANDARD/);
assert.match(checksReadme, /PROPERTY CXX_STANDARD/);
assert.match(checksReadme, /PROPERTIES CXX_STANDARD/);
assert.match(checksReadme, /helper identifier `CXX_STANDARDS` does not count/);
assert.match(checksReadme, /required_ruby_version/);
assert.match(checksReadme, /resources\/exceptions\/renderer/);
assert.match(checksReadme, /shallowest product-tree/);
assert.match(checksReadme, /CocoaPods/);
assert.match(checksReadme, /Ruby `spec\/\*\*\/\*_spec\.rb` \/ `\*\*\/\*_spec\.rb` \/ `\*\*\/test\/\*\*\/\*_test\.rb` \/ `test\/test_\*\.rb` \/ `\*\*\/test\/test_\*\.rb`/);
assert.match(checksReadme, /`\.cc` and `\.cxx` extensions/);
assert.match(checksReadme, /`src\/\*\.cpp` and `src\/\*\.cc` do not/);
assert.match(checksReadme, /`testdata\/user_test\.rb` does not count/);
assert.match(checksReadme, /slash-anchored and does not eat into the basename/);
assert.match(checksReadme, /deduped by path/);
assert.match(checksReadme, /distinct-path count/);
assert.match(checksReadme, /reported first hit prefers a product-suite path/);
assert.match(checksReadme, /installer.*examples.*abi/);
assert.match(checksReadme, /An installer-only or examples-only or abi-only tree still passes/);
assert.match(checksReadme, /A benchmark-only tree still passes/);
assert.match(checksReadme, /tests\/FooTests\.cs/);
assert.match(checksReadme, /`test\/test_\*\.rb` \(and `\*\*\/test\/test_\*\.rb`\) counts Jekyll-style prefix tests/);
assert.match(checksReadme, /still do not add `test\/test_\*\.rb` without the `test\/` segment/);
assert.match(checksReadme, /Do not add `\*\*\/\*\.cpp`/);
assert.match(checksReadme, /catch-alls do not count `tsconfig\.spec\.json` \/ `tsconfig\.test\.json`/);
assert.match(checksReadme, /detectLanguages` includes typescript\/javascript/);
assert.match(checksReadme, /A Go-only test tree still passes/);
assert.match(checksReadme, /sidecar Go tests/);
assert.match(checksReadme, /`linter` first-hit prefers/);
assert.match(checksReadme, /A golangci-only tree still passes/);
assert.match(checksReadme, /A Mix tree with only JS tests still passes/);
assert.match(checksReadme, /A Rails tree with only JS tests still passes/);
assert.match(checksReadme, /A Python tree with only JS tests still passes/);
assert.match(checksReadme, /Python-primary/);
assert.match(checksReadme, /A Java tree with only JS tests still passes/);
assert.match(checksReadme, /Java-primary/);
assert.match(checksReadme, /A Java tree with only Python tests still passes/);
assert.match(checksReadme, /src\/test\/java\/FooTest\.java/);
assert.match(checksReadme, /src\/jvmTest/);
assert.match(checksReadme, /foo\/src\/jvmTest\/java\/FooTest\.java/);
assert.match(checksReadme, /foo-tls\/src\/test\/java\/TlsTest\.java/);
assert.match(checksReadme, /A jvmTest-only tree still passes/);
assert.match(checksReadme, /do not prefer `src\/test` over `src\/jvmTest`/);
assert.match(checksReadme, /A testlib-only tree still passes/);
assert.match(checksReadme, /foo-testlib/);
assert.match(checksReadme, /packages\/foo\/test\/foo\.spec\.ts/);
assert.match(checksReadme, /integration\/cors\/e2e\/express\.spec\.ts/);
assert.match(checksReadme, /integration\/auto-mock/);
assert.match(checksReadme, /e2e-only tree still passes/);
assert.match(checksReadme, /A C# tree with only JS tests still passes/);
assert.match(checksReadme, /C#-primary/);
assert.match(checksReadme, /A C# tree with only jest/);
assert.match(checksReadme, /A Go tree with only JS tests still passes/);
assert.match(checksReadme, /A Go tree with only jest/);
assert.match(checksReadme, /A Mix tree with only prettier/);
assert.match(checksReadme, /A Rails tree with only prettier/);
assert.match(checksReadme, /A Python tree with only prettier/);
assert.match(checksReadme, /A JS-only prettier tree still passes/);
assert.match(checksReadme, /`lock-file` and `no-outdated-deps` share/);
assert.match(checksReadme, /shallowest product-tree lock/);
assert.match(checksReadme, /examples-only lock still passes `lock-file`/);
assert.match(checksReadme, /`test-script` is a runner/);
assert.match(checksReadme, /`\*Tests\.csproj` \/ `\*Test\.csproj`/);
assert.match(checksReadme, /A `build\.gradle` \/ `build\.gradle\.kts` or product `\*\.csproj`/);
assert.match(checksReadme, /`setup-script` first-hit is the shallowest product-tree/);
assert.match(checksReadme, /support\/build\.gradle/);
assert.match(checksReadme, /support-only tree still passes/);
assert.match(checksReadme, /modules-only tree still passes/);
assert.match(checksReadme, /lib\/foo\/modules\/setup\.py/);
assert.match(checksReadme, /`setup-script` first-hit among/);
assert.match(checksReadme, /Console-only/);
assert.match(checksReadme, /Fuzz-only or Tests-only tree still passes/);
assert.match(checksReadme, /`test-script` first-hit among/);
assert.match(checksReadme, /Fuzz-only tree still passes/);
assert.match(checksReadme, /`test-framework` first-hit among `vitest\.config\.\*` \/ `jest\.config\.\*`/);
assert.match(checksReadme, /Mix\/Elixir-primary/);
assert.match(checksReadme, /A JS-only jest tree still passes/);
assert.match(checksReadme, /A Mix tree with only jest/);
assert.match(checksReadme, /A Rails tree with only jest/);
assert.match(checksReadme, /Python-primary/);
assert.match(checksReadme, /A Python tree with only jest/);
assert.match(checksReadme, /`test-framework` also passes on `\*Tests\.csproj` \/ `\*Test\.csproj`/);
assert.match(checksReadme, /Product `Foo\.csproj` is not a framework/);
assert.match(checksReadme, /unquoted `node --test`/);
assert.match(checksReadme, /`node -- --test`/);
assert.match(checksReadme, /packages\/ext\/package\.json/);
assert.equal(/Foundational|Guided/.test(checksReadme), false);

const productRepoLiteral =
  /Dapper|Newtonsoft|DapperLib|JamesNK|junit-team|guava-testlib|vscode-typescript|microsoft\/TypeScript|ansible|django/i;
for (const file of [
  path.join(skillRoot(), "scripts", "evaluate.mjs"),
  catalogPath(),
]) {
  const text = fs.readFileSync(file, "utf8");
  assert.equal(productRepoLiteral.test(text), false, file);
}
const evaluateProductRepoLiteral =
  /Dapper|Newtonsoft|DapperLib|JamesNK|junit-team|guava-testlib|okhttp|retrofit|hashicorp|consul|terraform|microsoft\/TypeScript/i;
{
  const file = path.join(skillRoot(), "scripts", "evaluate.mjs");
  const text = fs.readFileSync(file, "utf8");
  assert.equal(evaluateProductRepoLiteral.test(text), false, file);
}

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
  if (/adr-scoring/.test(file)) continue;
  if (file.split(path.sep).includes("examples")) continue;
  const text = fs.readFileSync(file, "utf8").replaceAll("kodustech/agent-readiness", "");
  assert.equal(/factory|kodus/i.test(text), false, file);
}

for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
process.stdout.write("evaluate.test.mjs ok\n");
