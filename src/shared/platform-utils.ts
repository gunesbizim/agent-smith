// Cross-platform utilities — normalize behavior across Windows, Linux, macOS
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const IS_WINDOWS = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const IS_LINUX = process.platform === "linux";

// ---- Paths ----

/** Get the user's home directory — works on all platforms */
export function homeDir(): string {
  return os.homedir();
}

/** Normalize line endings to \n regardless of platform */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Split text into lines, handling all line ending styles */
export function splitLines(text: string): string[] {
  return normalizeLineEndings(text).split("\n");
}

/** Get the platform-appropriate executable extension */
export function exeExt(filename: string): string {
  return IS_WINDOWS ? `${filename}.exe` : filename;
}

/** Get the platform-appropriate script extension */
export function scriptExt(filename: string): string {
  return IS_WINDOWS ? `${filename}.cmd` : filename;
}

// ---- Command resolution ----

/** Whether spawning a CLI shim must go through a shell on this platform.
 *
 *  On Windows the globally-installed CLIs agent-smith shells out to (`claude`, `gh`, `npm`, `npx`,
 *  `winget`, `choco`) are `.cmd`/`.bat`/`.ps1` shims, not native `.exe`s. Modern Node refuses to
 *  launch a `.cmd`/`.bat` with `CreateProcess` directly (it throws), so the call must run through
 *  `cmd.exe` (`shell: true`), which resolves the shim via `PATHEXT`. On POSIX the binaries are real
 *  executables and we keep `shell: false` to preserve exact argv handling (no shell quoting of
 *  arbitrary inputs). Pure + parameterized so it is unit-testable. */
export function needsShellForCli(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "win32";
}

/** Check if a command exists on PATH — cross-platform which/where */
export function commandExists(cmd: string): boolean {
  try {
    if (IS_WINDOWS) {
      execSync(`where ${cmd}`, { stdio: "ignore" });
    } else {
      execSync(`command -v ${cmd}`, { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

/** Get the full path to a command, or null if not found */
export function resolveCommand(cmd: string): string | null {
  try {
    if (IS_WINDOWS) {
      const output = execSync(`where ${cmd}`, { encoding: "utf-8" });
      return output.split("\n")[0].trim();
    } else {
      const output = execSync(`command -v ${cmd}`, { encoding: "utf-8" });
      return output.trim();
    }
  } catch {
    return null;
  }
}

// ---- Python resolution ----

/** Find the best available Python command on this platform */
export function findPython(): string | null {
  // On Windows, prefer 'py' launcher (python.org) over 'python' (may be Store stub)
  const candidates = IS_WINDOWS
    ? ["py", "python3", "python"]
    : ["python3", "python"];
  for (const candidate of candidates) {
    if (commandExists(candidate)) {
      // On Windows, verify it's not the Microsoft Store redirect stub
      if (IS_WINDOWS) {
        try {
          const out = execSync(`${candidate} --version 2>&1`, { encoding: "utf-8" });
          if (out.toLowerCase().includes("microsoft store") || out.toLowerCase().includes("app execution")) {
            continue; // Skip Store stub, try next
          }
        } catch { continue; }
      }
      return candidate;
    }
  }
  return null;
}

/** Get the Python virtual environment Scripts/bin directory */
export function venvBin(venvPath: string): string {
  if (IS_WINDOWS) {
    return path.join(venvPath, "Scripts");
  }
  return path.join(venvPath, "bin");
}

/** Get the path to a tool installed in a Python venv */
export function venvTool(venvPath: string, toolName: string): string {
  return path.join(venvBin(venvPath), exeExt(toolName));
}

// ---- MCP Server command resolution ----

/** Build the MCP server config entry with platform-correct paths */
export interface MCPCommand {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function resolveMCPCommand(
  name: string,
  installType: "npm" | "npx" | "pipx" | "python" | "manual",
  command: string,
  args: string[],
): MCPCommand {
  if (installType === "npx") {
    // On Windows, npx is a .cmd script
    return {
      command: IS_WINDOWS ? "npx.cmd" : "npx",
      args,
      env: {},
    };
  }

  if (installType === "npm") {
    // Global npm installs go to different locations
    if (IS_WINDOWS) {
      return {
        command: `${command}.cmd`,
        args,
        env: {},
      };
    }
    return { command, args, env: {} };
  }

  if (installType === "pipx" || installType === "python") {
    // pipx installs to ~/.local/bin on Linux, ~/bin on macOS, or Scripts on Windows
    const pythonHome = findPython();
    if (pythonHome) {
      if (IS_WINDOWS) {
        return {
          command: `${command}.exe`,
          args,
          env: {},
        };
      }
      return { command, args, env: {} };
    }
  }

  return { command, args, env: {} };
}

// ---- PHP vendor paths ----

/** Get the PHP vendor bin directory for the current platform */
export function phpVendorBin(baseDir: string, toolName: string): string {
  if (IS_WINDOWS) {
    return path.join(baseDir, "vendor", "bin", `${toolName}.bat`);
  }
  return path.join(baseDir, "vendor", "bin", toolName);
}

// ---- Platform metadata ----

export const PLATFORM_INFO = {
  isWindows: IS_WINDOWS,
  isMac: IS_MAC,
  isLinux: IS_LINUX,
  platform: process.platform,
  arch: process.arch,
  home: homeDir(),
  temp: os.tmpdir(),
  eol: os.EOL,
} as const;

export function getPlatform(): "windows" | "macos" | "linux" {
  if (IS_WINDOWS) return "windows";
  if (IS_MAC) return "macos";
  return "linux";
}
