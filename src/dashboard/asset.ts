// Resolves the self-contained dashboard HTML shipped under templates/dashboard/ — same package-root
// pattern as src/scaffold/* (dist/dashboard/asset.js → ../../ → package root → templates/...).
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function dashboardHtmlPath(): string {
  return path.join(packageRoot(), "templates", "dashboard", "index.html");
}

let cached: string | null = null;
export function readDashboardHtml(): string {
  if (cached !== null) return cached;
  cached = fs.readFileSync(dashboardHtmlPath(), "utf-8");
  return cached;
}
