import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CACHE_TTL_MS,
  CANVAS_FILENAME,
  SIDECAR_FILENAME,
} from "./constants.mjs";
import { hashCatalog, skillRoot } from "./catalog.mjs";

export { skillRoot };

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function resolveRepoRoot(inputPath) {
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Repository path does not exist: ${resolved}`);
  }
  let current = resolved;
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return resolved;
    current = parent;
  }
}

export function readGitHead(repoRoot) {
  const gitDir = path.join(repoRoot, ".git");
  if (!fs.existsSync(gitDir)) return null;
  let headFile = path.join(gitDir, "HEAD");
  if (fs.existsSync(gitDir) && fs.statSync(gitDir).isFile()) {
    const pointer = fs.readFileSync(gitDir, "utf8").trim();
    const match = pointer.match(/gitdir:\s*(.+)/i);
    if (!match) return null;
    const linked = path.resolve(repoRoot, match[1]);
    headFile = path.join(linked, "HEAD");
  }
  if (!fs.existsSync(headFile)) return null;
  const raw = fs.readFileSync(headFile, "utf8").trim();
  if (/^[0-9a-f]{40,}$/i.test(raw)) return raw;
  const refMatch = raw.match(/^ref:\s*(.+)$/);
  if (!refMatch) return null;
  const refRel = refMatch[1];
  const gitRoot = path.dirname(headFile);
  const refPath = path.join(gitRoot, refRel);
  if (fs.existsSync(refPath)) return fs.readFileSync(refPath, "utf8").trim();
  const packed = path.join(gitRoot, "packed-refs");
  if (!fs.existsSync(packed)) return null;
  const needle = ` ${refRel}`;
  for (const line of fs.readFileSync(packed, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || line.startsWith("^")) continue;
    if (line.endsWith(needle)) return line.split(" ")[0];
  }
  return null;
}

export function cacheDir(repoRoot) {
  return path.join(repoRoot, ".cursor", "cache", "readiness");
}

export function cacheKey(repoRoot) {
  const head = readGitHead(repoRoot) ?? "no-git-head";
  return sha256([path.resolve(repoRoot), hashCatalog(), head].join("\n"));
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

export function writeCache(repoRoot, payload) {
  const dir = cacheDir(repoRoot);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cachePath(repoRoot), `${JSON.stringify(payload, null, 2)}\n`);
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

function findPromotedCanvas(store) {
  const canvases = path.join(store, "canvases");
  if (!fs.existsSync(canvases)) return null;
  let entries;
  try {
    entries = fs.readdirSync(canvases, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "new") continue;
    const source = path.join(canvases, entry.name, "source.canvas.tsx");
    if (!fs.existsSync(source)) continue;
    const text = fs.readFileSync(source, "utf8");
    if (text.includes("CodeReadinessCanvas") || text.includes("/CODE-READINESS")) {
      return {
        dir: path.join(canvases, entry.name),
        canvasPath: source,
        sidecarPath: path.join(canvases, entry.name, "source.canvas.data.json"),
        promotedId: entry.name,
      };
    }
  }
  return null;
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
  if (!process.env.CODE_READINESS_CANVAS_DIR && isCloudAgent()) {
    const store = userStorePath();
    const promoted = store ? findPromotedCanvas(store) : null;
    if (promoted) return promoted;
  }
  const dir = resolveManagedCanvasDir(repoRoot);
  return {
    dir,
    canvasPath: path.join(dir, CANVAS_FILENAME),
    sidecarPath: path.join(dir, SIDECAR_FILENAME),
  };
}

export function canvasLink(canvasPath) {
  if (isCloudAgent()) {
    return {
      kind: "cloud",
      markdown: null,
      file: canvasPath,
      note: "Link only the write-tool save-result URL. Never invent a URL. After promote, edit canvases/<uuid>/source.canvas.tsx only.",
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
