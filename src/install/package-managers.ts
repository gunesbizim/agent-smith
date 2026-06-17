// Package-manager detection for MCP installs.
//
// Each MCP server declares the underlying tools it needs (registry
// `requiresPackageManager`). Before installing we detect which are present and,
// for any that are missing, decide whether we can remediate without `sudo` (we
// never run a sudo/interactive installer — it would block a non-interactive
// `init`). Missing-and-not-auto-installable managers downgrade their servers to
// "skipped with a manual hint" rather than failing the whole run.
import { commandExists } from "../shared/platform-utils.js";
import { MCP_REGISTRY } from "./registry.js";
import type { MCPServerDefinition, PackageManager } from "../shared/types.js";

export interface PMStatus {
  name: PackageManager;
  present: boolean;
}

/** The command we probe on PATH for each package manager. */
const PM_PROBE: Record<PackageManager, string> = {
  npm: "npm",
  npx: "npx",
  pipx: "pipx",
  python: "python",
  brew: "brew",
  composer: "composer",
  php: "php",
  winget: "winget",
  choco: "choco",
};

/** Detect the presence of the given package managers (probe injected for tests). */
export function detectPackageManagers(
  needed: PackageManager[],
  has: (cmd: string) => boolean = commandExists,
): PMStatus[] {
  const unique = Array.from(new Set(needed));
  return unique.map((name) => ({ name, present: has(PM_PROBE[name]) || (name === "python" && has("python3")) }));
}

/** The union of package managers required across a set of servers. */
export function requiredManagersFor(servers: MCPServerDefinition[]): PackageManager[] {
  const set = new Set<PackageManager>();
  for (const s of servers) (s.requiresPackageManager ?? []).forEach((pm) => set.add(pm));
  return Array.from(set);
}

export interface PMRemediation {
  /** True when we can install this manager without sudo / interactivity. */
  autoInstallable: boolean;
  /** Human-readable next step. */
  hint: string;
}

/**
 * What to do about a missing package manager. We deliberately refuse to auto-run
 * anything needing `sudo` or interactive input (brew bootstrap, apt, composer) —
 * those get a manual hint so `init` never hangs on a password prompt.
 */
export function pmRemediation(pm: PackageManager, platform: NodeJS.Platform): PMRemediation {
  switch (pm) {
    case "npm":
    case "npx":
      return { autoInstallable: false, hint: "Install Node.js (bundles npm/npx): https://nodejs.org" };
    case "python":
      return { autoInstallable: false, hint: "Install Python 3: https://www.python.org/downloads" };
    case "pipx":
      // pip-based, no sudo — the one we can safely bootstrap.
      return { autoInstallable: true, hint: "python -m pip install --user pipx && python -m pipx ensurepath" };
    case "brew":
      return {
        autoInstallable: false,
        hint: platform === "darwin"
          ? "Install Homebrew: https://brew.sh"
          : "Install Homebrew (Linux) or use your distro package manager: https://brew.sh",
      };
    case "composer":
      return { autoInstallable: false, hint: "Install Composer: https://getcomposer.org/download" };
    case "php":
      return { autoInstallable: false, hint: "Install PHP: https://www.php.net/downloads" };
    case "winget":
      return { autoInstallable: false, hint: "winget ships with App Installer (Microsoft Store)" };
    case "choco":
      return { autoInstallable: false, hint: "Install Chocolatey: https://chocolatey.org/install" };
    default:
      return { autoInstallable: false, hint: "See the tool's documentation." };
  }
}

/** Convenience: required managers for the whole registry (used by docs/diagnostics). */
export function allRequiredManagers(): PackageManager[] {
  return requiredManagersFor(MCP_REGISTRY);
}
