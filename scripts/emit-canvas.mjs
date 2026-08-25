import fs from "node:fs";
import path from "node:path";
import { CANVAS_FILENAME } from "./constants.mjs";
import {
  canvasPaths,
  isCloudAgent,
  otherCanvasesExist,
  skillRoot,
} from "./lib.mjs";

function templatePath() {
  return path.join(skillRoot(), "canvas", CANVAS_FILENAME);
}

export function emitCanvas(repoRoot, payload) {
  const template = templatePath();
  if (!fs.existsSync(template)) {
    throw new Error(`Missing canvas template: ${template}`);
  }
  const { dir, canvasPath, sidecarPath } = canvasPaths(repoRoot);
  const firstCanvas = !otherCanvasesExist(dir, CANVAS_FILENAME);
  if (!fs.existsSync(dir)) {
    if (isCloudAgent() || process.env.CODE_READINESS_CANVAS_DIR) {
      fs.mkdirSync(dir, { recursive: true });
    } else {
      throw new Error(
        `Managed canvases directory does not exist: ${dir}. The local IDE provisions ~/.cursor/projects/<workspace>/canvases. Do not mkdir that path by hand.`,
      );
    }
  }
  const desired = fs.readFileSync(template);
  const existing = fs.existsSync(canvasPath) ? fs.readFileSync(canvasPath) : null;
  if (!existing || Buffer.compare(existing, desired) !== 0) {
    fs.writeFileSync(canvasPath, desired);
  }
  const sidecar = { report: payload };
  fs.writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
  return { canvasPath, sidecarPath, firstCanvas };
}
