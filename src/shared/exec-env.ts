// Shared subprocess environment for tool detection/installation.
//
// When agent-smith shells out to check for or install a tool (sentrux, serena, pipx, gitnexus,
// …), the child inherits whatever PATH the parent had — which, under `npx`/CI/non-login shells,
// often omits the dirs where user-installed CLIs actually live (~/.local/bin, /opt/homebrew/bin,
// ~/.cargo/bin, ~/go/bin). That made presence checks miss installed tools and report false
// "not available"/"failed" (e.g. serena, sentrux). detectionEnv() prepends those common bin dirs
// so checks and installs find tools wherever they were installed.
import os from "node:os";
import path from "node:path";

// Common user/global bin locations, prepended to PATH for detection/install subprocesses.
function commonBinDirs(): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(home, ".cargo", "bin"),
    path.join(home, "go", "bin"),
    path.join(home, ".npm-global", "bin"),
    "/usr/local/go/bin",
  ];
}

/** process.env with PATH augmented by common bin dirs (deduped, existing PATH preserved last). */
export function detectionEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const sep = path.delimiter;
  const existing = (base.PATH ?? "").split(sep).filter(Boolean);
  const merged: string[] = [];
  for (const dir of [...commonBinDirs(), ...existing]) {
    if (!merged.includes(dir)) merged.push(dir);
  }
  return { ...base, PATH: merged.join(sep) };
}
