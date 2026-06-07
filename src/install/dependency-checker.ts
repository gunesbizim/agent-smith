// System dependency checker
import { execSync } from "node:child_process";

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
    result.nodeVersion = execSync("node --version", { encoding: "utf-8" }).trim();
    result.checks.node = true;
  } catch {
    result.missing.push({ name: "Node.js", installHint: "https://nodejs.org" });
    result.checks.node = false;
    result.ok = false;
  }

  // npm
  try {
    result.npmVersion = execSync("npm --version", { encoding: "utf-8" }).trim();
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
    result.missing.push({ name: "git", installHint: "brew install git (or https://git-scm.com)" });
    result.checks.git = false;
    result.ok = false;
  }

  // Python
  try {
    result.pythonVersion = execSync("python3 --version 2>/dev/null || python --version 2>/dev/null", {
      encoding: "utf-8",
    }).trim();
    result.checks.python = true;

    // pipx
    try {
      execSync("pipx --version", { encoding: "utf-8" });
      result.pipxAvailable = true;
    } catch {
      // pipx not required unless Python MCPs needed
    }
  } catch {
    result.checks.python = false;
  }

  // gh CLI
  try {
    execSync("gh --version", { encoding: "utf-8" });
    result.ghAvailable = true;
    result.checks["gh-cli"] = true;
  } catch {
    result.checks["gh-cli"] = false;
  }

  return result;
}
