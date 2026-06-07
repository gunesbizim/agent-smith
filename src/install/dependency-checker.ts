// System dependency checker
import { execSync } from "node:child_process";
import { commandExists, findPython } from "../shared/platform-utils.js";

export interface DepCheckResult {
  ok: boolean;
  nodeVersion: string;
  npmVersion: string;
  gitVersion: string;
  pythonVersion: string | null;
  pipxAvailable: boolean;
  ghAvailable: boolean;
  missing: { name: string; installHint: string }[];
  checks: Record<string, boolean>;
}

export async function checkDependencies(): Promise<DepCheckResult> {
  const isWin = process.platform === "win32";
  const result: DepCheckResult = {
    ok: true,
    nodeVersion: "",
    npmVersion: "",
    gitVersion: "",
    pythonVersion: null,
    pipxAvailable: false,
    ghAvailable: false,
    missing: [],
    checks: {},
  };

  // Node
  try {
    const nodeCmd = isWin ? "node.exe" : "node";
    result.nodeVersion = execSync(`${nodeCmd} --version`, { encoding: "utf-8" }).trim();
    result.checks.node = true;
  } catch {
    result.missing.push({ name: "Node.js (>=20)", installHint: "https://nodejs.org" });
    result.checks.node = false;
    result.ok = false;
  }

  // npm
  try {
    const npmCmd = isWin ? "npm.cmd" : "npm";
    result.npmVersion = execSync(`${npmCmd} --version`, { encoding: "utf-8" }).trim();
    result.checks.npm = true;
  } catch {
    result.missing.push({ name: "npm", installHint: "Comes with Node.js" });
    result.checks.npm = false;
    result.ok = false;
  }

  // git
  try {
    result.gitVersion = execSync("git --version", { encoding: "utf-8" }).trim();
    result.checks.git = true;
  } catch {
    const hint = isWin ? "winget install Git.Git (or https://git-scm.com)" : "brew install git (or https://git-scm.com)";
    result.missing.push({ name: "git", installHint: hint });
    result.checks.git = false;
    result.ok = false;
  }

  // Python
  const python = findPython();
  if (python) {
    try {
      result.pythonVersion = execSync(`${python} --version`, { encoding: "utf-8" }).trim();
      result.checks.python = true;
    } catch {
      result.checks.python = false;
    }

    // pipx
    try {
      const pipxCmd = isWin ? "pipx.exe" : "pipx";
      execSync(`${pipxCmd} --version`, { encoding: "utf-8" });
      result.pipxAvailable = true;
    } catch {
      // pipx not required unless Python MCPs needed
    }
  } else {
    result.checks.python = false;
  }

  // gh CLI
  try {
    const ghCmd = isWin ? "gh.exe" : "gh";
    execSync(`${ghCmd} --version`, { encoding: "utf-8" });
    result.ghAvailable = true;
    result.checks["gh-cli"] = true;
  } catch {
    result.checks["gh-cli"] = false;
  }

  return result;
}
