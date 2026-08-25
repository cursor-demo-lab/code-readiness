import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FLAG_SET,
  KODUS_FLAGS,
  KODUS_PACKAGE,
  KODUS_TIMEOUT_MS,
  KODUS_VERSION,
} from "./constants.mjs";
import {
  childEnvWithoutAiKeys,
  readCache,
  resolveRepoRoot,
  withAiForcedOff,
  writeCache,
} from "./lib.mjs";

export function extractJson(stdout) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Kodus did not print a JSON object on stdout.");
  }
  return JSON.parse(stdout.slice(start, end + 1));
}

function invokeKodus(repoRoot) {
  return withAiForcedOff(repoRoot, () => {
    const result = spawnSync(
      "npx",
      ["--yes", KODUS_PACKAGE, repoRoot, ...KODUS_FLAGS],
      {
        env: childEnvWithoutAiKeys(),
        encoding: "utf8",
        timeout: KODUS_TIMEOUT_MS,
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    if (result.error) {
      throw result.error;
    }
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    try {
      return extractJson(stdout);
    } catch (error) {
      const detail = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
      throw new Error(
        `Kodus @${KODUS_VERSION} failed (${FLAG_SET}). Exit ${result.status}. ${error.message}${detail ? `\n${detail}` : ""}`,
      );
    }
  });
}

export function runKodus(inputPath, options = {}) {
  const repoRoot = resolveRepoRoot(inputPath);
  const started = Date.now();
  if (!options.force) {
    const cached = readCache(repoRoot);
    if (cached) {
      return {
        repoRoot,
        kodusJson: cached,
        cacheHit: true,
        duration_ms: Date.now() - started,
      };
    }
  }
  const kodusJson = invokeKodus(repoRoot);
  writeCache(repoRoot, kodusJson);
  return {
    repoRoot,
    kodusJson,
    cacheHit: false,
    duration_ms: Date.now() - started,
  };
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repo = process.argv[2] ?? process.cwd();
  const force = process.argv.includes("--force");
  const { kodusJson } = runKodus(repo, { force });
  process.stdout.write(`${JSON.stringify(kodusJson, null, 2)}\n`);
}
