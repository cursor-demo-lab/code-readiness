#!/usr/bin/env node
import path from "node:path";
import { canvasLink, readCache, resolveRepoRoot, writeCache } from "./lib.mjs";
import { emitCanvas } from "./emit-canvas.mjs";
import { evaluateRepo } from "./evaluate.mjs";
import { buildReport, chatLines } from "./report.mjs";

function parseArgs(argv) {
  const options = { force: false, json: false, skipCanvas: false, repo: null };
  const rest = [];
  for (const arg of argv) {
    if (arg === "--force") options.force = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--skip-canvas") options.skipCanvas = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown flag: ${arg}`);
    else rest.push(arg);
  }
  options.repo = rest[0] ?? process.cwd();
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot(options.repo);
  const started = Date.now();
  let evaluation = options.force ? null : readCache(repoRoot);
  const cacheHit = Boolean(evaluation?.results);
  if (!evaluation?.results) {
    evaluation = evaluateRepo(repoRoot);
    writeCache(repoRoot, evaluation);
  }
  const payload = buildReport(evaluation, {
    repoRoot,
    repoName: path.basename(repoRoot),
    duration_ms: Date.now() - started,
    cacheHit,
  });
  if (payload.run_metadata.llm_calls !== 0) {
    throw new Error("Skill path must not call an LLM. llm_calls is not 0.");
  }
  if (options.skipCanvas) {
    process.stdout.write(
      `${JSON.stringify(options.json ? { payload, canvas: null } : payload, null, 2)}\n`,
    );
    return;
  }
  const emitted = emitCanvas(repoRoot, payload);
  const link = canvasLink(emitted.canvasPath);
  const lines = chatLines(payload, link.markdown);
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({ payload, canvasPath: emitted.canvasPath, sidecarPath: emitted.sidecarPath, canvasLink: link, firstCanvas: emitted.firstCanvas, chat: lines }, null, 2)}\n`,
    );
    return;
  }
  process.stdout.write(`${lines.join("\n")}\n`);
  if (link.note) process.stdout.write(`${link.note}\n`);
  if (emitted.firstCanvas) {
    process.stdout.write(
      "A canvas is a live React panel beside chat. Open it from the save-result link.\n",
    );
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
