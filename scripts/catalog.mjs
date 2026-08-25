import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function skillRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function catalogPath() {
  return path.join(skillRoot(), "checks", "catalog.json");
}

export function loadCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath(), "utf8"));
}

export function hashCatalog() {
  return crypto.createHash("sha256").update(fs.readFileSync(catalogPath())).digest("hex");
}
