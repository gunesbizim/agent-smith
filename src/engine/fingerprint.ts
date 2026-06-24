// Working-tree fingerprint — identical algorithm to the sentrux gate hook so the TDD gate and the
// engine agree on "has the tree changed?". Hash of HEAD + `git stash create` (staged AND unstaged
// tracked content) + the untracked file list. gitignored files (incl. .agent-smith/runs/) are
// excluded, so writing run artifacts never changes the fingerprint.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

export function treeFingerprint(cwd: string): string {
  const head = git(["rev-parse", "HEAD"], cwd);
  const snapshot = git(["stash", "create"], cwd); // empty string when the tree is clean
  const untracked = git(["ls-files", "--others", "--exclude-standard"], cwd);
  return crypto.createHash("sha256").update(`${head}\n${snapshot}\n${untracked}`).digest("hex");
}

function git(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim(); // NOSONAR — fixed binary, fixed args
  } catch {
    return "";
  }
}
