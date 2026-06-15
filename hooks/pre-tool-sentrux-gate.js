#!/usr/bin/env node
/**
 * PreToolUse hook — deterministic Sentrux architecture gate.
 *
 * Intercepts `git push` and `gh pr create` and enforces the structural
 * baseline (.sentrux/baseline.json) WITHOUT relying on the LLM to remember:
 *
 *   - Regression (gate exits non-zero)  → DENY the tool call. The deny reason
 *     hands the model the gate output and points it at the remediation playbook
 *     in the /pr-review command. The LLM is only woken when there is real
 *     repair work — it never has to "remember" to run the gate.
 *
 *   - Improvement (quality up vs baseline) → ratchet automatically:
 *     `sentrux gate . --save`, then commit the new baseline. Zero LLM, zero
 *     tokens. The baseline is monotonic — it only ever moves up.
 *
 *   - No change → allow silently.
 *
 * Configure in .claude/settings.json (handled by src/scaffold/hooks.ts):
 *   "PreToolUse": [{ "matcher": "Bash", "hooks": [
 *     { "type": "command", "command": "node hooks/pre-tool-sentrux-gate.js" } ]}]
 */
import { execSync } from "node:child_process";
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

// ---- Read the intercepted tool call ----
let toolCall = {};
try {
  const raw = fs.readFileSync(0, "utf-8").trim();
  if (raw) toolCall = JSON.parse(raw);
} catch {
  /* no stdin */
}
const command = toolCall.tool_input?.command || toolCall.command || "";

// Only gate the operations that publish code: push or PR creation.
const isPush = /\bgit\s+push\b/.test(command);
const isPrCreate = /\bgh\s+pr\s+create\b/.test(command);
if (!isPush && !isPrCreate) allow();

const cwd = process.cwd();

// Skip cleanly if Sentrux isn't set up for this repo.
if (!fs.existsSync(path.join(cwd, ".sentrux", "baseline.json"))) allow();

function run(cmd) {
  // Returns { code, out } — never throws.
  try {
    const out = execSync(cmd, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

// sentrux must be on PATH; if not, don't block the user's push.
const probe = run("command -v sentrux");
if (probe.code !== 0) {
  allow("⚠ Sentrux not found on PATH — architecture gate skipped. Install sentrux to enforce the baseline.");
}

// ---- Run the gate ----
const gate = run("sentrux gate .");

// Parse "Quality:  <baseline> -> <current>" (arrow may be -> or →).
const q = gate.out.match(/Quality:\s*(\d+)\s*(?:->|→)\s*(\d+)/);
const baseline = q ? Number(q[1]) : null;
const current = q ? Number(q[2]) : null;

// ---- Regression → DENY (only path that involves the LLM) ----
if (gate.code !== 0) {
  const metrics = gate.out
    .split("\n")
    .filter((l) => /Quality:|Coupling:|Cycles:|God files:|degrad/i.test(l))
    .join("\n")
    .trim();
  deny(
    `Sentrux architecture gate FAILED — this ${isPrCreate ? "PR" : "push"} regresses below the saved baseline.\n\n` +
      `${metrics || gate.out.trim()}\n\n` +
      `Do NOT retry the push. Restore the baseline first (remediation only — no new features):\n` +
      `  • quality drop / new god file → re-extract the flattened pattern into its proper module\n` +
      `  • new duplication → factor it back into the shared abstraction\n` +
      `  • new cycles / coupling up → break the cycle, restore the layering\n` +
      `Touch only the regressing files, keep tests green, then re-run \`sentrux gate .\`. ` +
      `Full playbook: Step 0 of the /pr-review command.`,
  );
}

// ---- Improvement → ratchet the baseline automatically (no LLM) ----
if (baseline !== null && current !== null && current > baseline) {
  const save = run("sentrux gate . --save");
  if (save.code === 0) {
    // Commit only the baseline file, path-scoped so unrelated staged work is untouched.
    const commit = run(
      `git commit .sentrux/baseline.json -m "chore(sentrux): ratchet baseline ${baseline}->${current}"`,
    );
    if (commit.code === 0) {
      allow(`✓ Sentrux baseline ratcheted ${baseline} → ${current} and committed automatically. Proceeding.`);
    }
    // Couldn't commit (e.g. nothing changed / no git identity) — stage it and let the model commit.
    run("git add .sentrux/baseline.json");
    allow(
      `✓ Sentrux improved ${baseline} → ${current}; baseline saved and staged. ` +
        `Commit it as \`chore(sentrux): ratchet baseline ${baseline}->${current}\` before pushing.`,
    );
  }
  allow(`✓ Sentrux improved ${baseline} → ${current} but \`--save\` failed; ratchet manually.`);
}

// ---- No regression, no improvement → allow silently ----
allow();
