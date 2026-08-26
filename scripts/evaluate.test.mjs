import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCatalog, skillRoot } from "./catalog.mjs";
import { ATTRIBUTION, CI_GLOBS, IGNORE_DIRS, LEVEL_LABELS, LEVEL_THRESHOLD, TEST_FILE_GLOBS, thresholdForLevel } from "./constants.mjs";
import { CASE_INSENSITIVE_NAME_IDS, evaluateRepo, LOCK_FILES, recommend, scoreResults } from "./evaluate.mjs";
import { buildReport } from "./report.mjs";
import { ciFiles, detectLanguages, detectManifestLanguages, findMatches, globMatch, testFiles } from "./walk.mjs";

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
assert.equal(countedAt(3), 9);
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
assert.ok(aiContext.anyFiles.includes("GEMINI.md"));
assert.ok(aiContext.anyFiles.includes(".github/instructions/**/*.md"));
assert.ok(aiContext.anyFiles.includes(".windsurfrules"));
assert.ok(aiContext.anyFiles.includes("WARP.md"));
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
assert.ok(formatter.anyFiles.includes(".clang-format"));
assert.ok(formatter.anyFiles.includes(".swift-format"));
assert.ok(formatter.anyFiles.includes(".swiftformat"));
assert.ok(formatter.anyFiles.includes(".scalafmt.conf"));
assert.ok(formatter.anyFiles.includes(".php-cs-fixer.php"));
assert.ok(formatter.anyFiles.includes(".style.yapf"));
assert.equal(formatter.anyFiles.includes(".clang-tidy"), false);
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
assert.equal(
  typeChecker.fileContains.some((rule) => (rule.includes ?? []).some((token) => /\[tool\.ty\b/.test(token))),
  false,
);
assert.equal(
  typeChecker.fileContains.some((rule) => (rule.includes ?? []).some((token) => /basedpyright/i.test(token))),
  false,
);
assert.ok(typeChecker.anyFiles.includes("mypy.ini"));
assert.ok(typeChecker.fileContains.some((rule) => rule.file === "setup.cfg" && rule.includes.includes("[mypy]")));
assert.ok(typeChecker.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.mypy]")));
assert.ok(typeChecker.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.pyright]")));
assert.equal(typeChecker.tsconfigStrict, true);

const testFramework = catalog.criteria.find((row) => row.id === "test-framework");
assert.ok(testFramework.anyFiles.includes("conftest.py"));
assert.ok(testFramework.anyFiles.includes("tests/conftest.py"));
assert.ok(testFramework.anyFiles.includes("**/conftest.py"));
assert.ok(testFramework.anyFiles.includes("phpunit.xml"));
assert.ok(testFramework.anyFiles.includes("phpunit.xml.dist"));
assert.ok(testFramework.anyFiles.includes(".rspec"));
assert.ok(testFramework.anyFiles.includes("spec/spec_helper.rb"));
assert.ok(testFramework.anyGlobs.includes("**/tests/**/*.rs"));
assert.ok(testFramework.anyGlobs.includes("**/*_test.rs"));
assert.equal(testFramework.anyFiles.includes("Cargo.toml"), false);
assert.ok(testFramework.fileContains.some((rule) => rule.file === "pyproject.toml" && rule.includes.includes("[tool.pytest")));
assert.ok(testFramework.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("\"node --test\"")));
assert.ok(testFramework.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("node --test")));
assert.ok(testFramework.fileContains.some((rule) => rule.file === "package.json" && rule.includes.includes("node:test")));
assert.ok(testFramework.fileContains.some((rule) => rule.file === "pom.xml" && rule.includes.includes("junit")));
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
assert.ok(codeowners.anyFiles.includes("docs/CODEOWNERS"));
assert.ok(codeowners.anyFiles.includes("CODEOWNERS"));
assert.ok(codeowners.anyFiles.includes(".github/CODEOWNERS"));

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
assert.ok(containerization.anyFiles.includes(".cursor/environment.json"));
assert.equal(
  containerization.anyFiles.includes("environment.json"),
  false,
  "root environment.json is the wrong path; only .cursor/environment.json counts",
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
  "**/test/**/*_test.rb",
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
assert.equal(globMatch("test/models/user_test.rb", "**/test/**/*_test.rb"), true);
assert.equal(globMatch("activerecord/test/cases/base_test.rb", "**/test/**/*_test.rb"), true);
assert.equal(globMatch("lib/user.rb", "**/test/**/*_test.rb"), false);
assert.equal(globMatch("testdata/user_test.rb", "**/test/**/*_test.rb"), false);
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
assert.equal(scoredL1.nextLevelProgress.needed, Math.ceil(9 * LEVEL_THRESHOLD));

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
assert.match(mixedDepthFmt.formatter.message, /packages\/app\/\.prettierrc/);
assert.equal(/\.clang-format/.test(mixedDepthFmt.formatter.message), false);
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
  "activerecord/test/cases/base_test.rb": "class BasicsTest < ActiveRecord::TestCase\nend\n",
});
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

assertPass("test-script", { justfile: "test:\n    cargo test\n" }, /justfile/);
assertPass("test-script", { Justfile: "test:\n    pytest\n" }, /Justfile/);
assertPass(
  "test-script",
  { "Taskfile.yml": "version: '3'\ntasks:\n  test:\n    cmds: [go test ./...]\n" },
  /Taskfile\.yml/,
);
assertFail("test-script", { justfile: "build:\n    cargo build\n" });

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
assertPass("ai-context", { "packages/app/AGENTS.md": "# agents\n" }, /packages\/app\/AGENTS\.md/);
assertPass("linter", { "apps/web/biome.json": "{}\n" }, /apps\/web\/biome\.json/);
assertPass("type-checker", { "packages/lib/tsconfig.json": "{}\n" }, /packages\/lib\/tsconfig\.json/);
assert.equal(evalTree({ "packages/lib/tsconfig.json": "{}\n" })["type-checker"].skipped, false);
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
  "packages/vscode-typescript/LICENSE": "MIT\n",
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
assert.match(canvasTemplate, /containerization: "\.cursor\/environment\.json"/);
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
]) {
  assert.ok(
    whyForAgentsBlock.includes(key),
    `surviving WHY_FOR_AGENTS map lost ${key}`,
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

const skillMd = fs.readFileSync(path.join(skillRoot(), "SKILL.md"), "utf8");
assert.match(skillMd, /1 Functional, 2 Documented, 3 Standardized, 4 Optimized, 5 Autonomous/);
assert.match(skillMd, /one repository/);
assert.match(skillMd, /honesty gate/);
assert.match(skillMd, /would be Documented except/);
assert.match(skillMd, /gate-ranked/);
assert.match(skillMd, /remaining fails at `nextLevel` first/);
assert.match(skillMd, /category breakdown/);
assert.match(skillMd, /why it helps agents/);
assert.match(skillMd, /only for when `l1Capped` is true/);
assert.match(skillMd, /prescriptive linter/);
assert.match(skillMd, /WHY_FOR_AGENTS/);
assert.match(skillMd, /Do not dummy `\.editorconfig`/);
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

const checksReadme = fs.readFileSync(path.join(skillRoot(), "checks", "README.md"), "utf8");
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
assert.match(checksReadme, /any walked path with that basename/);
assert.match(checksReadme, /skip signals stay repository-root only/);
assert.match(checksReadme, /IGNORE_DIRS/);
assert.match(checksReadme, /\*\.gradle\.kts/);
assert.match(checksReadme, /empty asdf\/nvm files do not count/);
assert.match(checksReadme, /Empty formatter configs do not count/);
assert.match(checksReadme, /Empty or whitespace-only files do not count/);
assert.match(checksReadme, /deps.*vendor.*third_party.*third-party/);
assert.match(checksReadme, /examples\/\.prettierrc` still can/);
assert.match(checksReadme, /`license` matches LICENSE/);
assert.match(checksReadme, /shallowest/);
assert.match(checksReadme, /packages\/\*\/LICENSE/);
assert.match(checksReadme, /eslint\.config\.js/);
assert.match(checksReadme, /tests\/fixtures/);
assert.match(checksReadme, /packages-only linter/);
assert.match(checksReadme, /Do not reject empty linter configs/);
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
assert.match(checksReadme, /Ruby `spec\/\*\*\/\*_spec\.rb` \/ `\*\*\/test\/\*\*\/\*_test\.rb`/);
assert.match(checksReadme, /`\.cc` and `\.cxx` extensions/);
assert.match(checksReadme, /`src\/\*\.cpp` and `src\/\*\.cc` do not/);
assert.match(checksReadme, /`testdata\/user_test\.rb` does not count/);
assert.match(checksReadme, /deduped by path/);
assert.match(checksReadme, /distinct-path count/);
assert.equal(/Foundational|Guided/.test(checksReadme), false);

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
