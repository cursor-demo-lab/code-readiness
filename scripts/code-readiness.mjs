#!/usr/bin/env node
import { canvasLink } from "./lib.mjs";
import { emitCanvas } from "./emit-canvas.mjs";
import { chatLines, mapKodusReport } from "./map-report.mjs";
import { runKodus } from "./run-kodus.mjs";

function parseArgs(argv) {
  const options = { force: false, json: false, skipCanvas: false, repo: null };
  const rest = [];
  for (const arg of argv) {
    if (arg === "--force") options.force = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--skip-canvas") options.skipCanvas = true;
    else if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else rest.push(arg);
  }
  options.repo = rest[0] ?? process.cwd();
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const run = runKodus(options.repo, { force: options.force });
  const payload = mapKodusReport(run.kodusJson, {
    repoRoot: run.repoRoot,
    duration_ms: run.duration_ms,
    cacheHit: run.cacheHit,
  });
  if (payload.run_metadata.llm_calls !== 0) {
    throw new Error("Skill path must not call an LLM. llm_calls is not 0.");
  }
  if (options.skipCanvas) {
    if (options.json) {
      process.stdout.write(`${JSON.stringify({ payload, canvas: null }, null, 2)}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  const emitted = emitCanvas(run.repoRoot, payload);
  const link = canvasLink(emitted.canvasPath);
  const lines = chatLines(payload, link.markdown);
  const result = {
    payload,
    canvasPath: emitted.canvasPath,
    sidecarPath: emitted.sidecarPath,
    canvasLink: link,
    firstCanvas: emitted.firstCanvas,
    chat: lines,
  };
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${lines.join("\n")}\n`);
  if (emitted.firstCanvas) {
    process.stdout.write(
      "A canvas is a live React panel beside chat. Open the link above for the full Kodus report.\n",
    );
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
