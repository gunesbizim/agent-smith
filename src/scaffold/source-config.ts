// Write the resolved source dirs to .claude/agent-smith/config.json for the hooks to read.
//
// This is the EXECUTION half of source-dir resolution (A2): the analyze layer
// (resolveSourceDirs) produces the facts purely; the disk write lives here in scaffold so the
// cognitive/execution boundary holds — analyze/** never mutates state.
import path from "node:path";
import fs from "fs-extra";

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
