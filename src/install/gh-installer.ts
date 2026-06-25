// GitHub CLI (gh) installer — best-effort auto-install of the `gh` binary.
//
// `gh` is required by the git/ship workflows (PR creation, CI polling) but is
// optional for the rest of agent-smith, so this installer NEVER hard-fails: if
// it cannot install gh it returns a manual hint and the caller carries on.
//
// Safety: we only auto-install through package managers that do NOT need `sudo`
// (brew, winget, choco). A `sudo apt-get`-style install would block on a
// password prompt in a non-interactive `init`, so on Linux without Homebrew we
// surface the manual install hint instead of risking a hang.
import { spawn } from "node:child_process";
import { commandExists, needsShellForCli } from "../shared/platform-utils.js";

export interface GhInstallResult {
  /** True when gh is available on PATH after this call. */
  available: boolean;
  /** True when gh was already installed before this call. */
  alreadyPresent: boolean;
  /** True when this call installed gh. */
  installed: boolean;
  /** True when we could not auto-install (manual action needed). */
  skipped: boolean;
  /** Human-readable explanation / next step when not available. */
  reason?: string;
}

export const GH_MANUAL_HINT =
  "Install the GitHub CLI manually (https://github.com/cli/cli#installation), then run `gh auth login`.";

/**
 * Pick a no-sudo install command for `gh` on the given platform, or null when
 * none is available. Pure (the PATH probe is injected) so it is unit-testable.
 */
export function pickGhInstallCommand(
  platform: NodeJS.Platform,
  has: (cmd: string) => boolean = commandExists,
): { cmd: string; args: string[] } | null {
  if (platform === "darwin") {
    return has("brew") ? { cmd: "brew", args: ["install", "gh"] } : null;
  }
  if (platform === "win32") {
    if (has("winget")) {
      return { cmd: "winget", args: ["install", "--id", "GitHub.cli", "-e", "--source", "winget"] };
    }
    if (has("choco")) return { cmd: "choco", args: ["install", "gh", "-y"] };
    return null;
  }
  // linux (and anything else): only Homebrew, which needs no sudo.
  if (has("brew")) return { cmd: "brew", args: ["install", "gh"] };
  return null;
}

/** Run a command asynchronously (non-blocking, so a spinner keeps animating). On Windows the
 *  install managers (`winget`, `choco`) are shims that Node can't launch directly, so we route
 *  through cmd.exe (shell:true); on POSIX `brew` is a real binary and shell stays off. The args are
 *  fixed install flags (no user input), so shell quoting is not a concern. */
export function runGh(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "ignore", shell: needsShellForCli() });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

/** Injectable hooks so the install path is unit-testable without spawning. */
export interface GhInstallDeps {
  has?: (cmd: string) => boolean;
  run?: (cmd: string, args: string[]) => Promise<boolean>;
}

/**
 * Ensure the GitHub CLI is installed, attempting a best-effort auto-install when
 * it is missing. Never throws — returns a result describing what happened.
 */
export async function ensureGhCli(deps: GhInstallDeps = {}): Promise<GhInstallResult> {
  const has = deps.has ?? commandExists;
  const run = deps.run ?? runGh;

  if (has("gh")) {
    return { available: true, alreadyPresent: true, installed: false, skipped: false };
  }

  const install = pickGhInstallCommand(process.platform, has);
  if (!install) {
    return { available: false, alreadyPresent: false, installed: false, skipped: true, reason: GH_MANUAL_HINT };
  }

  const ok = await run(install.cmd, install.args);
  if (ok && has("gh")) {
    return { available: true, alreadyPresent: false, installed: true, skipped: false };
  }

  return {
    available: false,
    alreadyPresent: false,
    installed: false,
    skipped: true,
    reason: `Auto-install via \`${install.cmd} ${install.args.join(" ")}\` failed. ${GH_MANUAL_HINT}`,
  };
}
