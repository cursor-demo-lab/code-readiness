import fs from "node:fs";
import path from "node:path";
import { TEST_FILE_GLOBS, thresholdForLevel } from "./constants.mjs";
import {
  ciFiles,
  detectLanguages,
  detectManifestLanguages,
  findMatches,
  globMatch,
  isCppCmakeDominant,
  packageJson,
  packageJsonHas,
  parseTsconfigStrict,
  posixBasename,
  readText,
  testFiles,
  walkFiles,
} from "./walk.mjs";
import { catalogPath, loadCatalog } from "./catalog.mjs";

export const LOCK_FILES = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "bun.lockb",
  "bun.lock",
  "yarn.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "pdm.lock",
  "go.sum",
  "Cargo.lock",
  "gradle.lockfile",
  "packages.lock.json",
  "Gemfile.lock",
  "composer.lock",
  "Package.resolved",
  "mix.lock",
  "flake.lock",
  "cabal.project.freeze",
  "pixi.lock",
];

const NO_CONVENTIONAL_LOCKFILE_LANGUAGES = new Set([
  "java",
  "c",
  "cpp",
  "haskell",
  "python",
  "javascript",
  "typescript",
  "node",
  "rust",
]);

function hit(message, details) {
  return { pass: true, skipped: false, message, details };
}

function miss(message, details) {
  return { pass: false, skipped: false, message, details };
}

function skip(message) {
  return { pass: false, skipped: true, message };
}

function isGlobPattern(pattern) {
  return /[*?]/.test(pattern);
}

function isBasenameOnly(pattern) {
  return Boolean(pattern) && !pattern.includes("/") && !isGlobPattern(pattern);
}

const VERSION_PIN_IGNORE_SEGMENTS = [
  "testdata",
  "fixtures",
  "sample",
  "samples",
  "example",
  "examples",
  "starter",
  "starters",
  "demo",
  "demos",
];

function pathHasSegments(file, segments) {
  if (!segments?.length) return false;
  return file.split("/").some((part) => segments.includes(part));
}

function pathHasIgnoredVersionPin(file) {
  const parts = file.split("/");
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (VERSION_PIN_IGNORE_SEGMENTS.includes(part)) return true;
    if (part.endsWith("-tests") || part.endsWith("_tests")) return true;
    if (
      part === "resources" &&
      parts[i + 1] === "exceptions" &&
      parts[i + 2] === "renderer"
    ) {
      return true;
    }
  }
  return false;
}

function shouldIgnorePath(file, options) {
  if (typeof options.ignorePath === "function" && options.ignorePath(file)) return true;
  return pathHasSegments(file, options.ignorePathSegments);
}

function pathSegmentCount(file) {
  return file.split("/").length;
}

function comparePathDepth(a, b) {
  const depth = pathSegmentCount(a) - pathSegmentCount(b);
  if (depth !== 0) return depth;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function shallowestHit(files) {
  return [...files].sort(comparePathDepth)[0];
}

const STYLE_FIRST_HIT_DEFER_SEGMENTS = ["fixtures", "testdata", "assets"];
const STYLE_FIRST_HIT_DOCS_SEGMENTS = ["docs", "doc"];
const STYLE_FIRST_HIT_SAMPLE_SEGMENTS = ["sample", "samples", "example", "examples"];
const CONTAINER_FIRST_HIT_DEFER_SEGMENTS = [
  "tests",
  "test",
  "integration",
  "integration_test",
  ...STYLE_FIRST_HIT_SAMPLE_SEGMENTS,
];
const SETUP_FIRST_HIT_DEFER_SEGMENTS = ["support", "android", "examples"];
const TEST_FILE_FIRST_HIT_DEFER_SEGMENTS = ["installer", "examples", "abi"];
const TEST_FILE_CATCH_ALL_GLOBS = new Set(["**/*.test.*", "**/*.spec.*"]);
const BASENAME_GLOB_ANY_DEPTH_IDS = new Set(["linter", "formatter", "test-framework"]);

function isStyleFirstHitId(id) {
  return id === "linter" || id === "formatter" || id === "test-framework" || id === "test-script";
}

function matchBasenameGlobAnyDepth(id) {
  return BASENAME_GLOB_ANY_DEPTH_IDS.has(id);
}

function isDeferredStyleConfig(file) {
  const parts = file.split("/");
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (STYLE_FIRST_HIT_DEFER_SEGMENTS.includes(part)) return true;
    if (STYLE_FIRST_HIT_SAMPLE_SEGMENTS.includes(part)) return true;
    if (part === "tests" && parts[i + 1] === "format") return true;
    if (
      STYLE_FIRST_HIT_DOCS_SEGMENTS.includes(part) &&
      parts.slice(i + 1).some((next) => STYLE_FIRST_HIT_SAMPLE_SEGMENTS.includes(next))
    ) {
      return true;
    }
  }
  return false;
}

function productStyleHits(files) {
  const productHits = files.filter((file) => !isDeferredStyleConfig(file));
  return productHits.length > 0 ? productHits : files;
}

function isDeferredContainerConfig(file) {
  return pathHasSegments(file, CONTAINER_FIRST_HIT_DEFER_SEGMENTS);
}

function productContainerHits(files) {
  const productHits = files.filter((file) => !isDeferredContainerConfig(file));
  return productHits.length > 0 ? productHits : files;
}

function isDeferredSetupConfig(file) {
  return pathHasSegments(file, SETUP_FIRST_HIT_DEFER_SEGMENTS);
}

function isSetupDotnetProjectHit(file) {
  const name = posixBasename(file);
  return globMatch(name, "*.csproj") || globMatch(name, "*.sln");
}

function setupDotnetProjectRank(file) {
  if (isDeferredTestScriptProject(file)) return 2;
  if (isTestScriptProjectHit(file)) return 1;
  return 0;
}

function preferProductSetupProjects(files) {
  const projectHits = files.filter(isSetupDotnetProjectHit);
  if (projectHits.length === 0) return files;
  let best = Infinity;
  for (const file of projectHits) {
    const rank = setupDotnetProjectRank(file);
    if (rank < best) best = rank;
  }
  return files.filter((file) => !isSetupDotnetProjectHit(file) || setupDotnetProjectRank(file) === best);
}

function productSetupHits(files) {
  const productHits = files.filter((file) => !isDeferredSetupConfig(file));
  const ranked = productHits.length > 0 ? productHits : files;
  return preferProductSetupProjects(ranked);
}

function isTestScriptProjectHit(file) {
  const name = posixBasename(file);
  return (
    globMatch(name, "*Tests.csproj") ||
    globMatch(name, "*Test.csproj") ||
    globMatch(name, "*Tests.sln")
  );
}

function isDeferredTestScriptProject(file) {
  return /fuzz|bench/i.test(posixBasename(file));
}

function productTestScriptHits(files) {
  const projectHits = files.filter(isTestScriptProjectHit);
  const preferredProjects = projectHits.filter((file) => !isDeferredTestScriptProject(file));
  const withoutFuzzBench =
    preferredProjects.length > 0
      ? files.filter((file) => !isTestScriptProjectHit(file) || !isDeferredTestScriptProject(file))
      : files;
  return productStyleHits(withoutFuzzBench);
}

function isIssueTemplateChooserConfig(file) {
  const name = posixBasename(file);
  return name === "config.yml" || name === "config.yaml";
}

function isIssueForm(file) {
  if (isIssueTemplateChooserConfig(file)) return false;
  if (file === ".github/ISSUE_TEMPLATE.md" || file === ".github/ISSUE_TEMPLATE") return true;
  return file.startsWith(".github/ISSUE_TEMPLATE/");
}

function productIssueTemplateHits(files) {
  const forms = files.filter(isIssueForm);
  if (forms.length > 0) return forms;
  const withoutChooser = files.filter((file) => !isIssueTemplateChooserConfig(file));
  return withoutChooser.length > 0 ? withoutChooser : files;
}

function isTestFrameworkConfigHit(file) {
  const name = posixBasename(file);
  return globMatch(name, "vitest.config.*") || globMatch(name, "jest.config.*");
}

function isDeferredTestFrameworkSidecar(file) {
  return /coverage|integration/i.test(posixBasename(file));
}

function hasJsTsProductLanguage(languages) {
  return Boolean(languages?.has("typescript") || languages?.has("javascript"));
}

function isJsTsLinterFile(file) {
  const name = posixBasename(file);
  return (
    globMatch(name, "eslint.config.*") ||
    globMatch(name, ".eslintrc*") ||
    name === "biome.json" ||
    name === "biome.jsonc" ||
    name === ".oxlintrc.json"
  );
}

function isGolangciFile(file) {
  const name = posixBasename(file);
  return (
    name === ".golangci.yml" ||
    name === ".golangci.yaml" ||
    name === ".golangci.toml" ||
    name === ".golangci.json"
  );
}

function treeIsGoPrimary(files) {
  const list = files ?? [];
  return list.includes("go.mod") && !list.includes("package.json") && !list.includes("tsconfig.json");
}

function productLinterHits(files, languages, repoFiles) {
  const styleHits = productStyleHits(files);
  const jsHits = styleHits.filter(isJsTsLinterFile);
  const goHits = styleHits.filter(isGolangciFile);
  if (jsHits.length === 0 || goHits.length === 0) return styleHits;
  if (treeIsGoPrimary(repoFiles)) return goHits;
  if (hasJsTsProductLanguage(languages)) return jsHits;
  return styleHits;
}

function isGoTestFile(file) {
  return globMatch(posixBasename(file), "*_test.go");
}

function isJsTsTestFile(file) {
  return /\.(?:ts|tsx|js|mjs)$/i.test(posixBasename(file));
}

function treeHasJsTsTests(files) {
  return testFiles(files).some(isJsTsTestFile);
}

function deferGoTestSidecarHits(languages, repoFiles) {
  return hasJsTsProductLanguage(languages) && treeHasJsTsTests(repoFiles ?? []);
}

function isElixirTestFile(file) {
  const name = posixBasename(file);
  return (
    globMatch(name, "*_test.exs") ||
    globMatch(name, "*_spec.exs") ||
    name === "test_helper.exs"
  );
}

function isRubyTestFile(file) {
  const name = posixBasename(file);
  return (
    globMatch(name, "*_spec.rb") ||
    globMatch(name, "*_test.rb") ||
    name === "spec_helper.rb" ||
    name === "test_helper.rb"
  );
}

function deferJsTestSidecarForRuby(repoFiles) {
  const files = repoFiles ?? [];
  return files.includes("Gemfile") && files.some(isRubyTestFile);
}

function isPythonTestFile(file) {
  const name = posixBasename(file);
  return (
    globMatch(name, "test_*.py") ||
    globMatch(name, "*_test.py") ||
    (name === "conftest.py" && file.split("/").includes("tests"))
  );
}

function treeHasPythonManifest(files) {
  return files.includes("pyproject.toml") || files.includes("setup.py") || files.includes("setup.cfg");
}

function deferJsTestSidecarForPython(repoFiles) {
  const files = repoFiles ?? [];
  return treeHasPythonManifest(files) && files.some(isPythonTestFile);
}

function deferJsFrameworkSidecarHits(repoFiles) {
  const files = repoFiles ?? [];
  return (
    (files.includes("mix.exs") && files.some(isElixirTestFile)) ||
    deferJsTestSidecarForRuby(files) ||
    deferJsTestSidecarForPython(files) ||
    (files.includes("pytest.ini") && files.some(isPythonTestFile)) ||
    deferJsTestSidecarForJava(files) ||
    deferJsTestSidecarForCsharp(files)
  );
}

function isJavaTestFile(file) {
  const name = posixBasename(file);
  return globMatch(name, "*Test.java") || globMatch(name, "*Tests.java");
}

function treeHasJavaManifest(files) {
  return files.includes("pom.xml") || files.includes("build.gradle") || files.includes("build.gradle.kts");
}

function deferJsTestSidecarForJava(repoFiles) {
  const files = repoFiles ?? [];
  return treeHasJavaManifest(files) && files.some(isJavaTestFile);
}

function isCsharpTestFile(file) {
  const name = posixBasename(file);
  return globMatch(name, "*Tests.cs") || globMatch(name, "*Test.cs");
}

function isPreferredCsharpTestFile(file) {
  // Reuse test-script's Fuzz/Benchmark basename defer.
  return isCsharpTestFile(file) && !isDeferredTestScriptProject(file);
}

function treeHasCsharpManifest(files) {
  return files.some(isSetupDotnetProjectHit);
}

function deferJsTestSidecarForCsharp(repoFiles) {
  const files = repoFiles ?? [];
  return treeHasCsharpManifest(files) && files.some(isPreferredCsharpTestFile);
}

function shouldDeferCsharpFuzzTest(file, repoFiles) {
  const files = repoFiles ?? [];
  if (!isCsharpTestFile(file) || !isDeferredTestScriptProject(file)) return false;
  return files.some(isPreferredCsharpTestFile);
}

function dropDeferredCsharpTestsWhenOtherHitsExist(files) {
  const preferredOrNonFuzz = files.filter((file) => !isCsharpTestFile(file) || isPreferredCsharpTestFile(file));
  return preferredOrNonFuzz.length > 0 ? preferredOrNonFuzz : files;
}

function deferJsTestSidecarHits(repoFiles) {
  return (
    deferJsFrameworkSidecarHits(repoFiles) ||
    deferJsTestSidecarForRuby(repoFiles) ||
    deferJsTestSidecarForPython(repoFiles) ||
    deferJsTestSidecarForJava(repoFiles) ||
    deferJsTestSidecarForCsharp(repoFiles)
  );
}

function isJsFormatterSidecar(file) {
  const name = posixBasename(file);
  return (
    globMatch(name, ".prettierrc*") ||
    globMatch(name, "prettier.config.*") ||
    name === "biome.json" ||
    name === "biome.jsonc"
  );
}

function isMixFormatterFile(file) {
  return posixBasename(file) === ".formatter.exs";
}

function isRubyFormatterFile(file) {
  const name = posixBasename(file);
  return name === ".rubocop.yml" || name === ".rubocop.yaml" || name === ".standard.yml";
}

function deferJsFormatterSidecarHits(repoFiles) {
  const files = repoFiles ?? [];
  return (
    (files.includes("mix.exs") && files.some(isMixFormatterFile)) ||
    (files.includes("Gemfile") && files.some(isRubyFormatterFile))
  );
}

function productFormatterHits(files, repoFiles) {
  const styleHits = productStyleHits(files);
  if (!deferJsFormatterSidecarHits(repoFiles)) return styleHits;
  const withoutJsSidecar = styleHits.filter((file) => !isJsFormatterSidecar(file));
  return withoutJsSidecar.length > 0 ? withoutJsSidecar : styleHits;
}

function productTestFrameworkHits(files, languages, repoFiles) {
  const configHits = files.filter(isTestFrameworkConfigHit);
  const preferredConfigs = configHits.filter((file) => !isDeferredTestFrameworkSidecar(file));
  const withoutSidecars =
    preferredConfigs.length > 0
      ? files.filter((file) => !isTestFrameworkConfigHit(file) || !isDeferredTestFrameworkSidecar(file))
      : files;
  const withoutGoSidecar = deferGoTestSidecarHits(languages, repoFiles)
    ? withoutSidecars.filter((file) => !isGoTestFile(file))
    : withoutSidecars;
  const afterGo = withoutGoSidecar.length > 0 ? withoutGoSidecar : withoutSidecars;
  const withoutJsSidecar = deferJsFrameworkSidecarHits(repoFiles)
    ? afterGo.filter((file) => !isTestFrameworkConfigHit(file))
    : afterGo;
  const afterJs = withoutJsSidecar.length > 0 ? withoutJsSidecar : afterGo;
  // Fuzz/Benchmark *Tests.cs are not product C# tests; drop them when another hit exists
  // so they do not beat jest.config.* / FooTests.cs. A Fuzz-only tree still names Fuzz.
  const ranked = dropDeferredCsharpTestsWhenOtherHitsExist(afterJs);
  // Reuse test-script's *Tests.csproj / *Test.csproj Fuzz/Benchmark defer.
  return productTestScriptHits(ranked);
}

const TYPE_CHECKER_FIRST_HIT_DEFER_SEGMENTS = ["test", "tests", "spec", "__tests__"];

function isTypeCheckerConfigHit(file) {
  const name = posixBasename(file);
  return name === "tsconfig.json" || name === "jsconfig.json";
}

function isDeferredTypeCheckerConfig(file) {
  return (
    pathHasSegments(file, TYPE_CHECKER_FIRST_HIT_DEFER_SEGMENTS) ||
    pathHasSegments(file, STYLE_FIRST_HIT_DEFER_SEGMENTS)
  );
}

function productTypeCheckerHits(files) {
  const preferred = files.filter((file) => !isDeferredTypeCheckerConfig(file));
  return preferred.length > 0 ? preferred : files;
}

function firstFileHit(criterion, fileHits, languages, repoFiles) {
  if (criterion.id === "license") return shallowestHit(fileHits);
  if (criterion.id === "test-script") return shallowestHit(productTestScriptHits(fileHits));
  if (criterion.id === "test-framework") {
    return shallowestHit(productTestFrameworkHits(fileHits, languages, repoFiles));
  }
  if (criterion.id === "type-checker") {
    const configs = fileHits.filter(isTypeCheckerConfigHit);
    if (configs.length > 0) return shallowestHit(productTypeCheckerHits(configs));
    return fileHits[0];
  }
  if (criterion.id === "linter") {
    return shallowestHit(productLinterHits(fileHits, languages, repoFiles));
  }
  if (criterion.id === "formatter") {
    return shallowestHit(productFormatterHits(fileHits, repoFiles));
  }
  if (isStyleFirstHitId(criterion.id)) return shallowestHit(productStyleHits(fileHits));
  if (criterion.id === "containerization") return shallowestHit(productContainerHits(fileHits));
  if (criterion.id === "setup-script") return shallowestHit(productSetupHits(fileHits));
  if (criterion.id === "issue-templates") return shallowestHit(productIssueTemplateHits(fileHits));
  return fileHits[0];
}

function matchesLanguageTestGlob(file) {
  return TEST_FILE_GLOBS.some(
    (pattern) => !TEST_FILE_CATCH_ALL_GLOBS.has(pattern) && globMatch(file, pattern),
  );
}

function testFileSidecarLanguageRank(file, languages, repoFiles) {
  if (deferJsTestSidecarHits(repoFiles) && isJsTsTestFile(file)) return 1;
  if (!hasJsTsProductLanguage(languages) || !isGoTestFile(file)) return 0;
  return 1;
}

function testFileFirstHitRank(file, languages, repoFiles) {
  const sidecar = testFileSidecarLanguageRank(file, languages, repoFiles);
  const deferred = pathHasSegments(file, TEST_FILE_FIRST_HIT_DEFER_SEGMENTS) ? 1 : 0;
  const catchAllOnly = matchesLanguageTestGlob(file) ? 0 : 1;
  const fuzzBench = shouldDeferCsharpFuzzTest(file, repoFiles) ? 1 : 0;
  return sidecar * 4 + deferred * 2 + catchAllOnly + fuzzBench;
}

function rankTestFileHits(files, languages, repoFiles) {
  return [...files].sort((a, b) => {
    const rank =
      testFileFirstHitRank(a, languages, repoFiles) - testFileFirstHitRank(b, languages, repoFiles);
    if (rank !== 0) return rank;
    return comparePathDepth(a, b);
  });
}

function pathIgnoreFor(criterion) {
  if (criterion.id === "version-pinned") return { ignorePath: pathHasIgnoredVersionPin };
  if (criterion.ignorePathSegments) return { ignorePathSegments: criterion.ignorePathSegments };
  return {};
}

function fileHasContent(repoRoot, file) {
  return (readText(repoRoot, file) ?? "").trim().length > 0;
}

// Names where the artifact is the same document whatever the casing. Everywhere
// else casing is semantic (Makefile, Package.swift, the LICENSE-* globs).
export const CASE_INSENSITIVE_NAME_IDS = new Set(["readme", "contributing", "license"]);

function caseInsensitiveNamesFor(criterion) {
  return CASE_INSENSITIVE_NAME_IDS.has(criterion.id) ? { caseInsensitiveNames: true } : {};
}

function sameName(a, b) {
  return a === b || a.toLowerCase() === b.toLowerCase();
}

function evalAnyFiles(repoRoot, files, patterns, options = {}) {
  if (!patterns?.length) return [];
  const looseCase = Boolean(options.caseInsensitiveNames);
  const basenameGlobAnyDepth = Boolean(options.basenameGlobAnyDepth);
  const hits = [];
  for (const pattern of patterns) {
    if (isGlobPattern(pattern)) {
      // Style configs (eslint.config.*, .prettierrc.*) are looked up by
      // basename at any depth. Everything else keeps a no-slash glob
      // root-anchored: *.csproj matches Lib.csproj, not Src/Lib/Lib.csproj.
      if (!pattern.includes("/") && basenameGlobAnyDepth) {
        for (const file of files) {
          if (shouldIgnorePath(file, options)) continue;
          if (globMatch(posixBasename(file), pattern)) hits.push(file);
        }
        continue;
      }
      hits.push(...findMatches(files, [pattern]).filter((file) => !shouldIgnorePath(file, options)));
      continue;
    }
    const pathPattern = pattern.includes("/");
    if (looseCase) {
      // Walked paths first, so the reported hit is the casing on disk even when
      // the filesystem itself is case-insensitive. Sorted, because directory
      // order is not, and the root file should still win over a nested one.
      const matches = files.filter((file) => {
        if (shouldIgnorePath(file, options)) return false;
        return pathPattern ? sameName(file, pattern) : sameName(posixBasename(file), pattern);
      });
      if (matches.length > 0) {
        hits.push(...matches.sort(comparePathDepth));
        continue;
      }
    }
    if (!shouldIgnorePath(pattern, options) && fs.existsSync(path.join(repoRoot, pattern))) {
      const abs = path.join(repoRoot, pattern);
      if (options.skipDirectoryHits && fs.statSync(abs).isDirectory()) {
        // Directory presence is not a hit. Children match via globs / prefixes.
      } else {
        hits.push(pattern);
      }
    }
    if (pathPattern) continue;
    for (const file of files) {
      if (file !== pattern && posixBasename(file) === pattern && !shouldIgnorePath(file, options)) {
        hits.push(file);
      }
    }
  }
  return hits;
}

function evalFileContains(repoRoot, files, rules, options = {}) {
  if (!rules?.length) return null;
  const skipPackageSwift = isCppCmakeDominant(files);
  const skipRubyVersion = Boolean(options.skipRubyVersionIfSwift) && detectManifestLanguages(files).has("swift");
  const hits = [];
  for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
    const rule = rules[ruleIndex];
    const basenameOnly = isBasenameOnly(rule.file);
    const ruleOptions = rule.ignorePathSegments?.length
      ? {
          ...options,
          ignorePathSegments: [...(options.ignorePathSegments ?? []), ...rule.ignorePathSegments],
        }
      : options;
    const matches = files.filter((file) => {
      if (skipPackageSwift && posixBasename(file) === "Package.swift") return false;
      if (skipRubyVersion && posixBasename(file) === ".ruby-version") return false;
      if (shouldIgnorePath(file, ruleOptions)) return false;
      if (file === rule.file || globMatch(file, rule.file)) return true;
      return basenameOnly && posixBasename(file) === rule.file;
    });
    for (const file of matches) {
      const content = readText(repoRoot, file) ?? "";
      const needle = (rule.includes ?? []).find((token) => content.includes(token));
      if (!needle) continue;
      if (!options.preferShallowest && !options.preferProductStyleHit) return { file, needle };
      hits.push({ file, needle, ruleIndex });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => {
    if (options.preferProductStyleHit) {
      const deferred = Number(isDeferredStyleConfig(a.file)) - Number(isDeferredStyleConfig(b.file));
      if (deferred !== 0) return deferred;
    }
    const depth = pathSegmentCount(a.file) - pathSegmentCount(b.file);
    if (depth !== 0) return depth;
    if (a.ruleIndex !== b.ruleIndex) return a.ruleIndex - b.ruleIndex;
    if (a.file < b.file) return -1;
    if (a.file > b.file) return 1;
    return 0;
  });
  return { file: hits[0].file, needle: hits[0].needle };
}

function evalFileRegex(repoRoot, rules) {
  if (!rules?.length) return null;
  for (const rule of rules) {
    const content = readText(repoRoot, rule.file);
    if (!content) continue;
    if (new RegExp(rule.pattern, "i").test(content)) return rule.file;
  }
  return null;
}

function makefileHasTarget(repoRoot, spec) {
  if (!spec) return false;
  const makefile = readText(repoRoot, "Makefile");
  if (!makefile) return false;
  const rx = new RegExp(`^(${spec})\\s*:`, "m");
  return rx.test(makefile);
}

function evalCiGrep(repoRoot, files, pattern) {
  if (!pattern) return { configs: [], hit: null };
  const configs = ciFiles(files);
  const rx = new RegExp(pattern, "i");
  for (const file of configs) {
    const content = readText(repoRoot, file) ?? "";
    if (rx.test(content)) return { configs, hit: file };
  }
  return { configs, hit: null };
}

function hasNoConventionalLockfile(languages) {
  return [...languages].some((lang) => NO_CONVENTIONAL_LOCKFILE_LANGUAGES.has(lang));
}

function packageJsonPathHit(pkg, spec) {
  if (!spec) return null;
  const paths = Array.isArray(spec)
    ? spec
    : String(spec)
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);
  for (const dotted of paths) {
    if (packageJsonHas(pkg, dotted)) return dotted;
  }
  return null;
}

function hasEnvSignals(files) {
  return files.some((file) => {
    if (file.includes("/")) return false;
    if (file === ".env" || file === ".envrc" || file === "direnv") return true;
    if (file.startsWith(".env.")) return true;
    if (/^docker-compose.*\.ya?ml$/i.test(file)) return true;
    if (/^compose\.ya?ml$/i.test(file)) return true;
    return false;
  });
}

const LOCK_FIRST_HIT_DEFER_SEGMENTS = [
  "examples",
  "_examples",
  "example",
  "vendor",
  "vendors",
  "third_party",
  "third-party",
  "thirdparty",
];

function productLockFiles(files) {
  const hits = files.filter((file) => LOCK_FILES.includes(posixBasename(file)));
  const productHits = hits.filter(
    (file) => !pathHasSegments(file, LOCK_FIRST_HIT_DEFER_SEGMENTS),
  );
  const ranked = productHits.length > 0 ? productHits : hits;
  return [...ranked].sort((a, b) => {
    const depth = comparePathDepth(a, b);
    if (depth !== 0) return depth;
    return LOCK_FILES.indexOf(posixBasename(a)) - LOCK_FILES.indexOf(posixBasename(b));
  });
}

function lockFresh(repoRoot, files, days) {
  const found = productLockFiles(files);
  if (found.length === 0) return { ok: false, reason: "no lock file" };
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const name = found[0];
  try {
    const mtime = fs.statSync(path.join(repoRoot, name)).mtimeMs;
    if (mtime >= cutoff) return { ok: true, file: name };
  } catch {
    // missing or unreadable: treat as stale
  }
  return { ok: false, reason: "lock file older than 6 months", file: name };
}

function evalCriterion(criterion, ctx) {
  if (criterion.requiresLLM) {
    return skip("Skipped. v1 does not run L5 quality checks.");
  }

  if (criterion.tsconfigStrict) {
    if (fs.existsSync(path.join(ctx.repoRoot, "tsconfig.json"))) {
      const raw = readText(ctx.repoRoot, "tsconfig.json");
      if (parseTsconfigStrict(raw)) {
        return hit("TypeScript configured with strict mode in tsconfig.json");
      }
      return hit("Found tsconfig.json");
    }
  }

  if (criterion.minBytes) {
    const candidates = evalAnyFiles(
      ctx.repoRoot,
      ctx.files,
      criterion.anyFiles ?? [],
      caseInsensitiveNamesFor(criterion),
    );
    // Report the shallowest README that clears minBytes: with casing and
    // extension variants a repo can hit several patterns, and the root file is
    // the one a reader means.
    for (const file of candidates.sort(comparePathDepth)) {
      const content = readText(ctx.repoRoot, file) ?? "";
      if (content.length >= criterion.minBytes) {
        return hit(`${file} found with ${content.length} characters`);
      }
    }
    return miss(criterion.fail);
  }

  if (criterion.testFiles) {
    const found = rankTestFileHits(testFiles(ctx.files), ctx.languages, ctx.files);
    if (found.length > 0) {
      return hit(`Found ${found.length} test file(s): ${found[0]}`, found.slice(0, 8).join(", "));
    }
    return miss(criterion.fail);
  }

  if (criterion.ciFiles) {
    const found = ciFiles(ctx.files);
    if (found.length > 0) return hit(`CI configuration found: ${found[0]}`);
    return miss(criterion.fail);
  }

  if (criterion.id === "lock-file") {
    const found = productLockFiles(ctx.files);
    if (found.length > 0) return hit(`Found ${found[0]}`);
    if (hasNoConventionalLockfile(ctx.languages)) {
      return skip("This language has no conventional committed lockfile.");
    }
    return miss(criterion.fail);
  }

  if (criterion.lockFileFreshDays) {
    const result = lockFresh(ctx.repoRoot, ctx.files, criterion.lockFileFreshDays);
    if (result.ok) return hit(`Lock file ${result.file} modified within 6 months`);
    return miss(criterion.fail);
  }

  const pathIgnore = pathIgnoreFor(criterion);
  const styleFirstHit = isStyleFirstHitId(criterion.id);
  const containerFirstHit = criterion.id === "containerization";
  const setupFirstHit = criterion.id === "setup-script";
  const fileHits = evalAnyFiles(
    ctx.repoRoot,
    ctx.files,
    [...(criterion.anyFiles ?? []), ...(criterion.anyGlobs ?? [])],
    {
      ...pathIgnore,
      ...caseInsensitiveNamesFor(criterion),
      basenameGlobAnyDepth: matchBasenameGlobAnyDepth(criterion.id),
      skipDirectoryHits: criterion.id === "issue-templates",
    },
  );
  const usableHits = criterion.anyFilesNonEmpty
    ? fileHits.filter((file) => fileHasContent(ctx.repoRoot, file))
    : fileHits;
  const deferGoFramework =
    criterion.id === "test-framework" && deferGoTestSidecarHits(ctx.languages, ctx.files);
  const deferMixJsFramework =
    criterion.id === "test-framework" && deferJsFrameworkSidecarHits(ctx.files);
  const deferJsFormatter =
    criterion.id === "formatter" && deferJsFormatterSidecarHits(ctx.files);
  const productFileHits = styleFirstHit
    ? usableHits.filter((file) => {
        if (isDeferredStyleConfig(file)) return false;
        if (deferGoFramework && isGoTestFile(file)) return false;
        if (deferMixJsFramework && isTestFrameworkConfigHit(file)) return false;
        if (deferJsFormatter && isJsFormatterSidecar(file)) return false;
        return true;
      })
    : containerFirstHit
      ? usableHits.filter((file) => !isDeferredContainerConfig(file))
      : setupFirstHit
        ? usableHits.filter((file) => !isDeferredSetupConfig(file))
        : usableHits;
  if (productFileHits.length > 0) {
    return hit(`Found ${firstFileHit(criterion, productFileHits, ctx.languages, ctx.files)}`);
  }

  if (criterion.id === "env-documentation") {
    if (!hasEnvSignals(ctx.files)) {
      return skip("No environment or compose files to document.");
    }
  }

  const pkgPathHit = packageJsonPathHit(ctx.pkg, criterion.packageJsonPath);
  if (pkgPathHit) {
    return hit(`${pkgPathHit} found in package.json`);
  }

  if (makefileHasTarget(ctx.repoRoot, criterion.makefileTarget)) {
    return hit(`Makefile target matched: ${criterion.makefileTarget}`);
  }

  const contains = evalFileContains(ctx.repoRoot, ctx.files, criterion.fileContains, {
    ...pathIgnore,
    preferShallowest: criterion.id === "version-pinned",
    preferProductStyleHit: styleFirstHit,
    skipRubyVersionIfSwift: criterion.id === "version-pinned",
  });
  if (contains && (!styleFirstHit || !isDeferredStyleConfig(contains.file) || usableHits.length === 0)) {
    return hit(`${contains.file} contains ${contains.needle}`);
  }
  if (usableHits.length > 0) {
    return hit(`Found ${firstFileHit(criterion, usableHits, ctx.languages, ctx.files)}`);
  }
  if (contains) {
    return hit(`${contains.file} contains ${contains.needle}`);
  }

  const regexHit = evalFileRegex(ctx.repoRoot, criterion.fileRegex);
  if (regexHit) return hit(`${regexHit} documents the check`);

  if (criterion.ciGrep) {
    const { configs, hit: file } = evalCiGrep(ctx.repoRoot, ctx.files, criterion.ciGrep);
    if (file) return hit(`CI config matched in ${file}`);
    if (configs.length === 0 && !criterion.anyFiles && !criterion.packageJsonPath) {
      return miss("No CI configuration found to check.");
    }
    if (file == null && configs.length > 0 && !criterion.packageJsonPath && !criterion.makefileTarget) {
      return miss(criterion.fail);
    }
  }

  const langPass = criterion.languagesPass;
  if (langPass) {
    const manifests = detectManifestLanguages(ctx.files);
    for (const [lang, message] of Object.entries(langPass)) {
      if (manifests.has(lang)) return hit(message);
    }
  }

  if (criterion.id === "type-checker") {
    return skip("This language has no conventional type-checker file.");
  }

  return miss(criterion.fail);
}

function skipEditorconfigWhenLinterPasses(results) {
  const linter = results.find((row) => row.criterionId === "linter");
  const editorconfig = results.find((row) => row.criterionId === "editorconfig");
  if (!linter?.pass || linter.skipped) return;
  if (!editorconfig || editorconfig.pass || editorconfig.skipped) return;
  editorconfig.skipped = true;
  editorconfig.pass = false;
  editorconfig.message = "Prescriptive linter already configured.";
}

export function evaluateRepo(repoRoot) {
  const catalog = loadCatalog();
  const files = walkFiles(repoRoot);
  const ctx = {
    repoRoot,
    files,
    languages: detectLanguages(files),
    pkg: packageJson(repoRoot),
    catalogPath: catalogPath(),
  };
  const results = [];
  for (const criterion of catalog.criteria) {
    const outcome = evalCriterion(criterion, ctx);
    results.push({
      criterionId: criterion.id,
      name: criterion.name,
      pillarId: criterion.pillarId,
      level: criterion.level,
      requiresLLM: Boolean(criterion.requiresLLM),
      pass: outcome.pass,
      skipped: outcome.skipped,
      message: outcome.message,
      details: outcome.details,
      fix: criterion.fix,
      effort: criterion.effort ?? "medium",
    });
  }
  skipEditorconfigWhenLinterPasses(results);
  return { catalog, files, languages: [...ctx.languages], results };
}

export function scoreResults(catalog, results) {
  const byPillar = new Map(catalog.pillars.map((p) => [p.id, []]));
  for (const row of results) {
    const list = byPillar.get(row.pillarId) ?? [];
    list.push(row);
    byPillar.set(row.pillarId, list);
  }
  const pillarScores = catalog.pillars.map((pillar) => {
    const rows = (byPillar.get(pillar.id) ?? []).filter((row) => !row.skipped);
    const passed = rows.filter((row) => row.pass).length;
    const total = rows.length;
    const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;
    return {
      pillarId: pillar.id,
      name: pillar.name,
      passed,
      total,
      percentage,
    };
  });

  const counted = results.filter((row) => !row.skipped);
  const levelStats = (level) => {
    const atLevel = counted.filter((row) => row.level === level);
    return {
      passed: atLevel.filter((row) => row.pass).length,
      total: atLevel.length,
    };
  };
  const l1 = levelStats(1);
  const l2 = levelStats(2);

  let highestPassed = 1;
  for (const level of [1, 2, 3, 4, 5]) {
    const atLevel = counted.filter((row) => row.level === level);
    if (atLevel.length === 0) {
      highestPassed = level;
      continue;
    }
    const passedCount = atLevel.filter((row) => row.pass).length;
    if (passedCount / atLevel.length >= thresholdForLevel(level)) highestPassed = level;
    else break;
  }

  const nextLevel = highestPassed < 5 ? highestPassed + 1 : null;
  let current = 0;
  let needed = 0;
  let remaining = 0;
  if (nextLevel != null) {
    const nextRows = counted.filter((row) => row.level === nextLevel);
    current = nextRows.filter((row) => row.pass).length;
    needed = Math.ceil(nextRows.length * thresholdForLevel(nextLevel));
    remaining = Math.max(0, needed - current);
  }

  const totalPassed = pillarScores.reduce((sum, s) => sum + s.passed, 0);
  const totalCriteria = pillarScores.reduce((sum, s) => sum + s.total, 0);
  const scorePercent =
    totalCriteria === 0 ? 0 : Math.round((totalPassed / totalCriteria) * 100);

  return {
    level: highestPassed,
    scorePercent,
    pillarScores,
    l1Passed: l1.passed,
    l1Total: l1.total,
    l2Passed: l2.passed,
    l2Total: l2.total,
    nextLevelProgress: {
      current,
      needed,
      remaining,
      nextLevel,
    },
  };
}

const IMPACT_ORDER = { high: 0, medium: 1, low: 2 };
const EFFORT_ORDER = { low: 0, medium: 1, high: 2 };

export function recommend(results, level) {
  const l1Open = results.some((row) => row.level === 1 && !row.pass && !row.skipped);
  const nextLevel = l1Open ? 1 : level + 1;
  const failed = results.filter((row) => !row.pass && !row.skipped);
  const recs = failed.map((row) => {
    let impact = "low";
    if (row.level === nextLevel) impact = "high";
    else if (row.level === nextLevel + 1) impact = "medium";
    return {
      id: row.criterionId,
      title: row.name,
      description: row.fix,
      reason: row.message,
      effort: row.effort ?? "medium",
      impact,
      pillarId: row.pillarId,
      criterionId: row.criterionId,
      criterionLevel: row.level,
    };
  });
  recs.sort((a, b) => {
    const aNext = a.criterionLevel === nextLevel ? 0 : 1;
    const bNext = b.criterionLevel === nextLevel ? 0 : 1;
    if (aNext !== bNext) return aNext - bNext;
    const impact = IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact];
    if (impact !== 0) return impact;
    return EFFORT_ORDER[a.effort] - EFFORT_ORDER[b.effort];
  });
  return recs.slice(0, 5).map(({ criterionLevel: _level, ...rest }) => rest);
}
