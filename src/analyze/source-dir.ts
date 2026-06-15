// Source directory resolution — where a project's code lives.
//
// Used to write .claude/agent-smith/config.json, which the stop-change-detector hook
// reads to classify changed files. Resolution order:
//   1. Detected backend/frontend dirs (when those are real subdirectories).
//   2. Common conventional roots that exist on disk (src, lib, app, ...).
//   3. Interactive prompt asking the user to pinpoint the path (when a TTY is available).
//   4. Fallback to ["src"].
import path from "node:path";
import fs from "fs-extra";
import readline from "node:readline";
import type { DetectedProject } from "../shared/types.js";

const CONVENTIONAL_DIRS = ["src", "lib", "app", "source", "backend", "frontend", "server", "client", "packages", "apps"];

// Detect source dirs without any prompting. Exported for testing.
export function detectSourceDirs(projectRoot: string, project: DetectedProject): string[] {
  const found = new Set<string>();

  // Honor detected backend/frontend dirs when they are real subdirectories.
  for (const dir of [/* backend dir hints */ "backend", "server", "api", "frontend", "client", "web"]) {
    if (dirExists(projectRoot, dir)) found.add(dir);
  }

  // Common conventional roots.
  for (const dir of CONVENTIONAL_DIRS) {
    if (dirExists(projectRoot, dir)) found.add(dir);
  }

  // Monorepo workspaces.
  if (project.monorepo) {
    for (const dir of ["packages", "apps", "services", "libs"]) {
      if (dirExists(projectRoot, dir)) found.add(dir);
    }
  }

  return [...found];
}

// Resolve source dirs, prompting the user when detection finds nothing and a TTY exists.
export async function resolveSourceDirs(
  projectRoot: string,
  project: DetectedProject,
  opts: { interactive: boolean },
): Promise<string[]> {
  const detected = detectSourceDirs(projectRoot, project);
  if (detected.length > 0) return detected;

  if (opts.interactive && process.stdin.isTTY) {
    const answer = await promptForPath();
    if (answer) {
      const dirs = answer.split(",").map((s) => s.trim()).filter(Boolean);
      if (dirs.length > 0) return dirs;
    }
  }

  // Could not detect and user did not pinpoint → assume src.
  return ["src"];
}

function promptForPath(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log("\nCould not auto-detect where your source code lives.");
    console.log("  Enter the source directory path(s), comma-separated (e.g. src, lib)");
    console.log("  [default: src]");
    rl.question("  > ", (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

// Write the resolved source dirs to .claude/agent-smith/config.json for the hooks to read.
export async function writeSourceConfig(projectRoot: string, sourceDirs: string[], dryRun = false): Promise<void> {
  if (dryRun) return;
  const cfgDir = path.join(projectRoot, ".claude", "agent-smith");
  await fs.ensureDir(cfgDir);
  const cfgPath = path.join(cfgDir, "config.json");
  let existing: Record<string, unknown> = {};
  try {
    existing = await fs.readJson(cfgPath);
  } catch {
    /* new file */
  }
  await fs.writeJson(cfgPath, { ...existing, sourceDirs }, { spaces: 2 });
}

function dirExists(root: string, dir: string): boolean {
  try {
    return fs.statSync(path.join(root, dir)).isDirectory();
  } catch {
    return false;
  }
}
