// Obsidian vault setup — resolve a per-repo vault path and ensure the directory
// exists before the obsidian MCP is registered.
//
// The `mcp-obsidian` server is pointed at an existing directory and does NOT
// create one itself. If the path does not exist the server fails to start —
// which is why `init`/`configure` appeared to "not create a vault". This helper
// closes that gap by creating the directory, and exports OBSIDIAN_VAULT_PATH so
// registerLocalMCPs() picks it up.
import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";
import fs from "fs-extra";

/** Prompt once for a value on a TTY; returns "" when non-interactive or blank. */
async function promptValue(message: string): Promise<string> {
  if (!process.stdin.isTTY) return "";
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((resolve) => rl.question(message, resolve));
    return answer.trim();
  } finally {
    rl.close();
  }
}

export interface ObsidianVaultResult {
  /** Absolute vault path, or null when obsidian was skipped. */
  vaultPath: string | null;
  /** True when this call created the directory (it did not previously exist). */
  created: boolean;
}

/**
 * Resolve the Obsidian vault path, ensure the directory exists, and export
 * OBSIDIAN_VAULT_PATH so the obsidian local-scope MCP registers correctly.
 *
 * Resolution order:
 *  - OBSIDIAN_VAULT_PATH already set in the environment wins (still gets created).
 *  - Interactive TTY: prompt; the suggested default is `<projectRoot>/vault`.
 *    A blank answer skips obsidian (no directory is created).
 *  - Non-interactive with no env var: skip — never create a surprise directory.
 */
export async function setupObsidianVault(
  projectRoot: string,
  opts: { interactive?: boolean } = {},
): Promise<ObsidianVaultResult> {
  const defaultPath = path.join(projectRoot, "vault");
  let vaultPath = (process.env.OBSIDIAN_VAULT_PATH ?? "").trim();

  if (!vaultPath && opts.interactive) {
    const answer = await promptValue(
      chalk.white(`\nObsidian vault path for this repo (e.g. ${defaultPath}; blank to skip obsidian): `),
    );
    if (answer) vaultPath = path.resolve(answer);
  }

  if (!vaultPath) return { vaultPath: null, created: false };

  const existed = fs.existsSync(vaultPath);
  fs.ensureDirSync(vaultPath);
  process.env.OBSIDIAN_VAULT_PATH = vaultPath;
  return { vaultPath, created: !existed };
}
