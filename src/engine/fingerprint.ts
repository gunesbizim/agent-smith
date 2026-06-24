// Working-tree fingerprint — deterministic for a given tree state so the TDD gate and the engine
// agree on "has the tree changed?". Hash of HEAD + the staged+unstaged tracked-content TREE + the
// untracked file list. We use the TREE object of `git stash create` (content-addressed, no
// timestamp) rather than the stash COMMIT sha (which embeds a timestamp and would differ between the
// engine's green-proof and the gate's check on an unchanged tree). gitignored files (incl.
// .agent-smith/runs/) are excluded, so writing run artifacts never changes the fingerprint.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

export function treeFingerprint(cwd: string): string {
  const head = git(["rev-parse", "HEAD"], cwd);
  const stash = git(["stash", "create"], cwd); // commit sha (timestamped) or "" when the tree is clean
  const tree = stash
    ? git(["rev-parse", `${stash}^{tree}`], cwd)
    : git(["rev-parse", "HEAD^{tree}"], cwd);
  const untracked = git(["ls-files", "--others", "--exclude-standard"], cwd);
  return crypto.createHash("sha256").update(`${head}\n${tree}\n${untracked}`).digest("hex");
}

function git(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim(); // NOSONAR — fixed binary, fixed args
  } catch {
    return "";
  }
}
