import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  CACHE_TTL_MS,
  CANVAS_FILENAME,
  SIDECAR_FILENAME,
  CONFIG_FILENAMES,
  FLAG_SET,
  KODUS_VERSION,
} from "./constants.mjs";

export function skillRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function resolveRepoRoot(inputPath) {
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Repository path does not exist: ${resolved}`);
  }
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: resolved,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return top;
  } catch {
    return resolved;
  }
}

export function gitHead(repoRoot) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function gitPorcelain(repoRoot) {
  try {
    return execFileSync("git", ["status", "--porcelain"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "not-a-git-repo\n";
  }
}

export function findConfigPath(repoRoot) {
  for (const name of CONFIG_FILENAMES) {
    const candidate = path.join(repoRoot, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function configHash(repoRoot) {
  const configPath = findConfigPath(repoRoot);
  if (!configPath) return "noconfig";
  return sha256(fs.readFileSync(configPath));
}

export function cacheKey(repoRoot) {
  const head = gitHead(repoRoot) ?? "not-a-git-repo";
  const porcelain = gitPorcelain(repoRoot);
  const parts = [
    path.resolve(repoRoot),
    KODUS_VERSION,
    FLAG_SET,
    configHash(repoRoot),
    head,
    porcelain,
  ];
  return sha256(parts.join("\n"));
}

export function cacheDir(repoRoot) {
  return path.join(repoRoot, ".cursor", "cache", "readiness");
}

export function cachePath(repoRoot) {
  return path.join(cacheDir(repoRoot), `${cacheKey(repoRoot)}.json`);
}

export function readCache(repoRoot) {
  const file = cachePath(repoRoot);
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function writeCache(repoRoot, kodusJson) {
  const dir = cacheDir(repoRoot);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cachePath(repoRoot), `${JSON.stringify(kodusJson, null, 2)}\n`);
}

export function childEnvWithoutAiKeys() {
  const env = { ...process.env };
  for (const key of ["OPENAI_API_KEY", "KODUS_API_KEY"]) {
    delete env[key];
  }
  env.CI = env.CI || "true";
  env.NO_UPDATE_NOTIFIER = "1";
  env.npm_config_update_notifier = "false";
  env.npm_config_fund = "false";
  env.npm_config_audit = "false";
  return env;
}

export function withAiForcedOff(repoRoot, fn) {
  const configPath = findConfigPath(repoRoot);
  if (!configPath) return fn();
  const original = fs.readFileSync(configPath, "utf8");
  if (!/aiEnabled:\s*true/.test(original)) return fn();
  const patched = original.replace(/aiEnabled:\s*true/g, "aiEnabled: false");
  fs.writeFileSync(configPath, patched);
  try {
    return fn();
  } finally {
    fs.writeFileSync(configPath, original);
  }
}

export function isCloudAgent() {
  if (process.env.CODE_READINESS_SURFACE === "cloud") return true;
  if (process.env.CODE_READINESS_SURFACE === "local") return false;
  return fs.existsSync("/cursor/stores/self");
}

export function userStorePath() {
  if (process.env.CURSOR_USER_STORE) return process.env.CURSOR_USER_STORE;
  if (process.env.CURSOR_AGENT_STORE) return process.env.CURSOR_AGENT_STORE;
  if (fs.existsSync("/cursor/stores/self")) return "/cursor/stores/self";
  return null;
}

function resolveProjectSlug(projectsRoot, repoRoot) {
  if (process.env.CURSOR_PROJECT_SLUG) return process.env.CURSOR_PROJECT_SLUG;
  if (!fs.existsSync(projectsRoot)) {
    throw new Error(
      `Local Cursor projects directory not found: ${projectsRoot}. Set CODE_READINESS_CANVAS_DIR.`,
    );
  }
  const entries = fs
    .readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (entries.includes("workspace")) return "workspace";
  const base = path.basename(path.resolve(repoRoot));
  const match = entries.find((name) => name === base || name.endsWith(base));
  if (match) return match;
  if (entries.length === 1) return entries[0];
  throw new Error(
    `Cannot resolve ~/.cursor/projects slug. Set CODE_READINESS_CANVAS_DIR. Candidates: ${entries.join(", ")}`,
  );
}

export function resolveManagedCanvasDir(repoRoot) {
  if (process.env.CODE_READINESS_CANVAS_DIR) {
    return process.env.CODE_READINESS_CANVAS_DIR;
  }
  if (isCloudAgent()) {
    const store = userStorePath();
    if (!store) {
      throw new Error(
        "Cloud agent store not found. Set CURSOR_USER_STORE or CODE_READINESS_CANVAS_DIR.",
      );
    }
    return path.join(store, "canvases", "new");
  }
  const home = os.homedir();
  const projectsRoot = path.join(home, ".cursor", "projects");
  const slug = resolveProjectSlug(projectsRoot, repoRoot);
  return path.join(projectsRoot, slug, "canvases");
}

export function canvasPaths(repoRoot) {
  const dir = resolveManagedCanvasDir(repoRoot);
  return {
    dir,
    canvasPath: path.join(dir, CANVAS_FILENAME),
    sidecarPath: path.join(dir, SIDECAR_FILENAME),
  };
}

export function canvasLink(canvasPath) {
  if (isCloudAgent()) {
    const store = userStorePath();
    const storeId = store ? path.basename(path.resolve(store)) : "self";
    return {
      kind: "cloud",
      markdown: `https://cursor.com/canvas/${storeId}/code-readiness`,
      file: canvasPath,
    };
  }
  return {
    kind: "local",
    markdown: canvasPath,
    file: canvasPath,
  };
}

export function otherCanvasesExist(canvasDir, filename) {
  if (!fs.existsSync(canvasDir)) return false;
  return fs
    .readdirSync(canvasDir)
    .some((name) => name.endsWith(".canvas.tsx") && name !== filename);
}

export function fileExists(repoRoot, name) {
  return fs.existsSync(path.join(repoRoot, name));
}
