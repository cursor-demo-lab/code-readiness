import fs from "node:fs";
import path from "node:path";
import { CI_GLOBS, IGNORE_DIRS, TEST_FILE_GLOBS } from "./constants.mjs";

export function toPosix(rel) {
  return rel.split(path.sep).join("/");
}

export function globToRegExp(pattern) {
  let src = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      const afterSlash = pattern[i + 2] === "/";
      src += afterSlash ? "(?:.*/)?" : ".*";
      i += afterSlash ? 2 : 1;
      continue;
    }
    if (ch === "*") {
      src += "[^/]*";
      continue;
    }
    if (ch === "?") {
      src += "[^/]";
      continue;
    }
    if ("\\^$+{}[]()|.".includes(ch)) src += `\\${ch}`;
    else src += ch;
  }
  return new RegExp(`^${src}$`);
}

export function globMatch(relPath, pattern) {
  return globToRegExp(pattern).test(toPosix(relPath));
}

export function walkFiles(repoRoot) {
  const files = [];
  function walk(absDir, relDir) {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.isFile() || entry.isSymbolicLink()) files.push(rel);
    }
  }
  walk(repoRoot, "");
  return files;
}

export function findMatches(files, patterns) {
  const hits = [];
  const seen = new Set();
  for (const pattern of patterns) {
    const rx = globToRegExp(pattern);
    for (const file of files) {
      if (!rx.test(file)) continue;
      const key = toPosix(file);
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(file);
    }
  }
  return hits;
}

export function readText(repoRoot, rel) {
  const abs = path.join(repoRoot, rel);
  try {
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

export function exists(repoRoot, rel) {
  return fs.existsSync(path.join(repoRoot, rel));
}

export function packageJson(repoRoot) {
  const raw = readText(repoRoot, "package.json");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function packageJsonHas(pkg, dotted) {
  if (!pkg) return false;
  const parts = dotted.split(".");
  let cur = pkg;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object" || !(part in cur)) return false;
    cur = cur[part];
  }
  return cur != null && cur !== "";
}

export function posixBasename(file) {
  const slash = file.lastIndexOf("/");
  return slash === -1 ? file : file.slice(slash + 1);
}

export function isSwiftSourceFile(file) {
  return file.endsWith(".swift") && posixBasename(file) !== "Package.swift";
}

export function isCppSourceFile(file) {
  return /\.(cpp|cc|cxx|hpp|hh)$/i.test(file);
}

export function isCppCmakeDominant(files) {
  const hasSwiftSrc = files.some(isSwiftSourceFile);
  if (hasSwiftSrc) return false;
  const hasCmake = files.some((file) => posixBasename(file) === "CMakeLists.txt");
  const hasCpp = files.some(isCppSourceFile);
  return hasCmake || hasCpp;
}

function isSwiftManifest(files) {
  return files.includes("Package.swift") && !isCppCmakeDominant(files);
}

export function detectLanguages(files) {
  const langs = new Set();
  const has = (name) => files.includes(name) || files.some((f) => f === name);
  if (has("go.mod") || files.some((f) => f.endsWith(".go"))) langs.add("go");
  if (has("Cargo.toml")) langs.add("rust");
  if (
    has("pyproject.toml") ||
    has("requirements.txt") ||
    has("setup.py") ||
    files.some((f) => f.endsWith(".py"))
  ) {
    langs.add("python");
  }
  if (has("package.json") || has("tsconfig.json")) langs.add("node");
  if (
    has("package.json") ||
    files.some((f) => /\.(js|mjs|cjs|jsx)$/i.test(f))
  ) {
    langs.add("javascript");
  }
  if (
    has("tsconfig.json") ||
    files.some((f) => /\.(ts|tsx|mts|cts)$/i.test(f))
  ) {
    langs.add("typescript");
  }
  if (has("pom.xml") || has("build.gradle") || files.some((f) => f.endsWith(".java"))) {
    langs.add("java");
  }
  if (has("build.gradle.kts") || files.some((f) => f.endsWith(".kt"))) langs.add("kotlin");
  if (files.some((f) => f.endsWith(".csproj") || f.endsWith(".sln") || f === "global.json")) {
    langs.add("csharp");
  }
  if (isSwiftManifest(files) || files.some(isSwiftSourceFile)) langs.add("swift");
  if (files.some((f) => f.endsWith(".c"))) langs.add("c");
  if (files.some((f) => /\.(cpp|cc|cxx|hpp|hh)$/i.test(f))) langs.add("cpp");
  if (
    has("stack.yaml") ||
    has("cabal.project") ||
    files.some((f) => f.endsWith(".hs") || f.endsWith(".cabal"))
  ) {
    langs.add("haskell");
  }
  return langs;
}

const LANGUAGE_PASS_MANIFESTS = {
  go: (files) => files.includes("go.mod"),
  rust: (files) => files.includes("Cargo.toml"),
  java: (files) => files.includes("pom.xml") || files.includes("build.gradle"),
  kotlin: (files) => files.includes("build.gradle.kts"),
  csharp: (files) => files.some((file) => file.endsWith(".csproj") || file === "global.json"),
  swift: isSwiftManifest,
};

export function detectManifestLanguages(files) {
  const langs = new Set();
  for (const [lang, test] of Object.entries(LANGUAGE_PASS_MANIFESTS)) {
    if (test(files)) langs.add(lang);
  }
  return langs;
}

export function ciFiles(files) {
  return findMatches(files, CI_GLOBS);
}

function isTsOrJsConfigBasename(file) {
  const base = posixBasename(file);
  return base.startsWith("tsconfig.") || base.startsWith("jsconfig.");
}

export function testFiles(files) {
  return findMatches(files, TEST_FILE_GLOBS).filter((file) => {
    if (isTsOrJsConfigBasename(file)) return false;
    const parts = file.split("/");
    return !parts.some(
      (part) => part === "fixtures" || part === "snapshots" || part === "__snapshots__",
    );
  });
}

export function parseTsconfigStrict(raw) {
  if (!raw) return false;
  const stripped = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  try {
    const parsed = JSON.parse(stripped);
    return parsed?.compilerOptions?.strict === true;
  } catch {
    return /"strict"\s*:\s*true/.test(raw);
  }
}
