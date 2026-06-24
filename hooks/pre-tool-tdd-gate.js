#!/usr/bin/env node
/**
 * PreToolUse hook — deterministic TDD gate.
 *
 * Sits BEFORE the sentrux gate in the PreToolUse(Bash) chain. Intercepts `git commit`, `git push`
 * and `gh pr create` and hard-DENIES the operation unless the TDD cycle is closed for the current
 * working tree — i.e. the tests that were proven RED by the engine are now verified green on exactly
 * this tree. A failing test is never a judgment call, so this denies (unlike sentrux which "asks").
 *
 * It does NOT run the test suite itself (suites can take minutes and would blow the hook timeout).
 * Instead it checks a `green-proof.json` the engine writes after the CODE phase: a list of the
 * previously-red test ids plus the working-tree fingerprint they passed on. If the fingerprint no
 * longer matches (the tree changed) or any new test isn't listed as passing, it denies.
 *
 * BACKWARD-COMPAT: if there is no active engine run (no `.agent-smith/runs/current` pointer, or that
 * run has no red-proof.json), it ALLOWS silently — a developer using plain `/as-backend` is gated
 * only by the existing git-guard + sentrux gate, exactly as before.
 *
 * Configure in .claude/settings.json (handled by src/scaffold/hooks.ts):
 *   "PreToolUse": [{ "matcher": "Bash", "hooks": [
 *     { "type": "command", "command": "node hooks/pre-tool-tdd-gate.js" } ]}]
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PRE = "PreToolUse";

function emit(obj) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: PRE, ...obj } }));
  process.exit(0);
}
function allow(additionalContext) {
  emit(additionalContext ? { additionalContext } : {});
}
function deny(reason) {
  emit({ permissionDecision: "deny", permissionDecisionReason: reason });
}

// ---- pure, testable helpers ----

export function isGatedCommand(command) {
  return /\bgit\s+commit\b/.test(command) || /\bgit\s+push\b/.test(command) || /\bgh\s+pr\s+create\b/.test(command);
}

/**
 * Decide the gate from already-loaded artifacts. Pure — no fs, no git.
 *  @param redProof  parsed red-proof.json (or null when no active TDD run)
 *  @param greenProof parsed green-proof.json (or null)
 *  @param fingerprint current working-tree fingerprint
 *  @returns { decision: "allow"|"deny", reason: string|null }
 */
export function decideTddGate({ redProof, greenProof, fingerprint }) {
  if (!redProof) return { decision: "allow", reason: null }; // no active TDD run → backward-compat
  const redIds = Array.isArray(redProof.newTests) ? redProof.newTests.map((t) => t.id) : [];
  if (redIds.length === 0) return { decision: "allow", reason: null };

  if (!greenProof) {
    return { decision: "deny", reason: "TDD gate: new tests were authored but never verified green. Run the test suite so every new test passes, then commit." };
  }
  if (greenProof.fingerprint !== fingerprint) {
    return { decision: "deny", reason: "TDD gate: the working tree changed since the tests last passed. Re-run the suite to re-verify before committing." };
  }
  const passing = new Set(Array.isArray(greenProof.passing) ? greenProof.passing : []);
  const stillRed = redIds.filter((id) => !passing.has(id));
  if (stillRed.length > 0) {
    return { decision: "deny", reason: `TDD gate: these new tests are not green yet: ${stillRed.join(", ")}. Make them pass before committing.` };
  }
  return { decision: "allow", reason: "✓ TDD cycle closed — every new test is green on the current tree." };
}

export function treeFingerprint(cwd) {
  // Deterministic for a given tree state: hash the stash commit's TREE (content-addressed, no
  // timestamp), not the stash COMMIT sha. Must match src/engine/fingerprint.ts exactly so the
  // engine's green-proof and this gate compare reliably on an unchanged tree.
  const head = git(["rev-parse", "HEAD"], cwd);
  const stash = git(["stash", "create"], cwd);
  const tree = stash ? git(["rev-parse", `${stash}^{tree}`], cwd) : git(["rev-parse", "HEAD^{tree}"], cwd);
  const untracked = git(["ls-files", "--others", "--exclude-standard"], cwd);
  return crypto.createHash("sha256").update(`${head}\n${tree}\n${untracked}`).digest("hex");
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim(); // NOSONAR — fixed binary, fixed args
  } catch {
    return "";
  }
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

// ---- hook entry point ----

function main() {
  let toolCall = {};
  try {
    const raw = fs.readFileSync(0, "utf-8").trim();
    if (raw) toolCall = JSON.parse(raw);
  } catch {
    /* no stdin */
  }
  const command = toolCall.tool_input?.command || toolCall.command || "";
  if (!isGatedCommand(command)) allow();

  const cwd = process.cwd();
  const runsDir = path.join(cwd, ".agent-smith", "runs");
  const pointer = path.join(runsDir, "current");
  if (!fs.existsSync(pointer)) allow(); // no active engine run → backward-compat

  let runId = "";
  try {
    runId = fs.readFileSync(pointer, "utf-8").trim();
  } catch {
    allow();
  }
  const runDir = path.join(runsDir, runId);
  const redProof = readJsonSafe(path.join(runDir, "red-proof.json"));
  if (!redProof) allow(); // active pointer but no proven RED → not a TDD-gated tree

  const greenProof = readJsonSafe(path.join(runDir, "green-proof.json"));
  const { decision, reason } = decideTddGate({ redProof, greenProof, fingerprint: treeFingerprint(cwd) });
  if (decision === "deny") deny(reason);
  allow(reason);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPathSafe(import.meta.url);
if (invokedDirectly) main();

function fileURLToPathSafe(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}
