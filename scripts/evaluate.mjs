import fs from "node:fs";
import path from "node:path";
import { thresholdForLevel } from "./constants.mjs";
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
  return file.split("/").some((part) => {
    if (VERSION_PIN_IGNORE_SEGMENTS.includes(part)) return true;
    return part.endsWith("-tests") || part.endsWith("_tests");
  });
}

function shouldIgnorePath(file, options) {
  if (typeof options.ignorePath === "function" && options.ignorePath(file)) return true;
  return pathHasSegments(file, options.ignorePathSegments);
}

function pathSegmentCount(file) {
  return file.split("/").length;
}

function shallowestHit(files) {
  return [...files].sort((a, b) => {
    const depth = pathSegmentCount(a) - pathSegmentCount(b);
    if (depth !== 0) return depth;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  })[0];
}

const LINTER_FIRST_HIT_DEFER_SEGMENTS = ["fixtures", "testdata"];

function firstFileHit(criterion, fileHits) {
  if (criterion.id === "license") return shallowestHit(fileHits);
  if (criterion.id === "linter") {
    const productHits = fileHits.filter(
      (file) => !pathHasSegments(file, LINTER_FIRST_HIT_DEFER_SEGMENTS),
    );
    return shallowestHit(productHits.length > 0 ? productHits : fileHits);
  }
  return fileHits[0];
}

function pathIgnoreFor(criterion) {
  if (criterion.id === "version-pinned") return { ignorePath: pathHasIgnoredVersionPin };
  if (criterion.ignorePathSegments) return { ignorePathSegments: criterion.ignorePathSegments };
  return {};
}

function fileHasContent(repoRoot, file) {
  return (readText(repoRoot, file) ?? "").trim().length > 0;
}

function evalAnyFiles(repoRoot, files, patterns, options = {}) {
  if (!patterns?.length) return [];
  const hits = [];
  for (const pattern of patterns) {
    if (isGlobPattern(pattern)) {
      hits.push(...findMatches(files, [pattern]).filter((file) => !shouldIgnorePath(file, options)));
      continue;
    }
    if (pattern.includes("/")) {
      if (!shouldIgnorePath(pattern, options) && fs.existsSync(path.join(repoRoot, pattern))) {
        hits.push(pattern);
      }
      continue;
    }
    if (!shouldIgnorePath(pattern, options) && fs.existsSync(path.join(repoRoot, pattern))) {
      hits.push(pattern);
    }
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
  for (const rule of rules) {
    const basenameOnly = isBasenameOnly(rule.file);
    const ruleOptions = rule.ignorePathSegments?.length
      ? {
          ...options,
          ignorePathSegments: [...(options.ignorePathSegments ?? []), ...rule.ignorePathSegments],
        }
      : options;
    const matches = files.filter((file) => {
      if (skipPackageSwift && posixBasename(file) === "Package.swift") return false;
      if (shouldIgnorePath(file, ruleOptions)) return false;
      if (file === rule.file || globMatch(file, rule.file)) return true;
      return basenameOnly && posixBasename(file) === rule.file;
    });
    for (const file of matches) {
      const content = readText(repoRoot, file) ?? "";
      const needle = (rule.includes ?? []).find((token) => content.includes(token));
      if (needle) return { file, needle };
    }
  }
  return null;
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

function lockFresh(repoRoot, files, days) {
  const found = LOCK_FILES.filter((name) => files.includes(name));
  if (found.length === 0) return { ok: false, reason: "no lock file" };
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const name of found) {
    try {
      const mtime = fs.statSync(path.join(repoRoot, name)).mtimeMs;
      if (mtime >= cutoff) return { ok: true, file: name };
    } catch {
      continue;
    }
  }
  return { ok: false, reason: "lock file older than 6 months", file: found[0] };
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
    const candidates = evalAnyFiles(ctx.repoRoot, ctx.files, criterion.anyFiles ?? []);
    for (const file of candidates) {
      const content = readText(ctx.repoRoot, file) ?? "";
      if (content.length >= criterion.minBytes) {
        return hit(`${file} found with ${content.length} characters`);
      }
    }
    return miss(criterion.fail);
  }

  if (criterion.testFiles) {
    const found = testFiles(ctx.files);
    if (found.length > 0) {
      return hit(`Found ${found.length} test file(s)`, found.slice(0, 8).join(", "));
    }
    return miss(criterion.fail);
  }

  if (criterion.ciFiles) {
    const found = ciFiles(ctx.files);
    if (found.length > 0) return hit(`CI configuration found: ${found[0]}`);
    return miss(criterion.fail);
  }

  if (criterion.lockFileFreshDays) {
    const result = lockFresh(ctx.repoRoot, ctx.files, criterion.lockFileFreshDays);
    if (result.ok) return hit(`Lock file ${result.file} modified within 6 months`);
    return miss(criterion.fail);
  }

  const pathIgnore = pathIgnoreFor(criterion);
  const fileHits = evalAnyFiles(
    ctx.repoRoot,
    ctx.files,
    [...(criterion.anyFiles ?? []), ...(criterion.anyGlobs ?? [])],
    pathIgnore,
  );
  if (fileHits.length > 0) {
    if (criterion.anyFilesNonEmpty) {
      const realHit = fileHits.find((file) => fileHasContent(ctx.repoRoot, file));
      if (realHit) return hit(`Found ${realHit}`);
    } else {
      return hit(`Found ${firstFileHit(criterion, fileHits)}`);
    }
  }

  if (criterion.id === "lock-file") {
    if (hasNoConventionalLockfile(ctx.languages)) {
      return skip("This language has no conventional committed lockfile.");
    }
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

  const contains = evalFileContains(ctx.repoRoot, ctx.files, criterion.fileContains, pathIgnore);
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
  const nextLevel = level + 1;
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
