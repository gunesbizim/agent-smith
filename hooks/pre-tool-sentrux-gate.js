#!/usr/bin/env node
/**
 * PreToolUse hook — deterministic Sentrux architecture gate.
 *
 * Intercepts `git commit`, `git push` and `gh pr create` and enforces the
 * structural baseline (.sentrux/baseline.json) WITHOUT relying on the LLM to
 * remember. Sentrux compares EVERY tracked metric (quality, coupling, cycles,
 * god files, complexity) and prints its verdict to stdout.
 *
 *   - Degradation (sentrux prints "✗ DEGRADED") → ASK the human. We never
 *     auto-approve a commit/push that erodes architecture; a human must
 *     explicitly approve it. The prompt hands over the gate metrics and the
 *     remediation playbook (/pr-review Step 0).
 *
 *   - Improvement (any tracked metric better, none worse) → ratchet the
 *     baseline automatically: `sentrux gate . --save`. On `git push` we also
 *     commit it so it travels with the push; otherwise we stage it and tell
 *     the model to commit. Zero LLM, zero tokens — the baseline only moves up.
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

// Surface a yes/no prompt to the human — they decide whether to proceed.
function ask(reason) {
  emit({ permissionDecision: "ask", permissionDecisionReason: reason });
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

// Gate the operations that record or publish code: commit, push, PR creation.
const isCommit = /\bgit\s+commit\b/.test(command);
const isPush = /\bgit\s+push\b/.test(command);
const isPrCreate = /\bgh\s+pr\s+create\b/.test(command);
if (!isCommit && !isPush && !isPrCreate) allow();

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

// sentrux must be on PATH; if not, don't block the user.
const probe = run("command -v sentrux");
if (probe.code !== 0) {
  allow("⚠ Sentrux not found on PATH — architecture gate skipped. Install sentrux to enforce the baseline.");
}

// ---- Run the gate ----
const gate = run("sentrux gate .");

// `sentrux gate` signals the verdict in stdout, NOT the exit code — it exits 0
// even when it reports "✗ DEGRADED". So key off the text, falling back to the
// exit code. If we recognise neither verdict the gate likely errored — allow
// rather than block on an unparseable failure.
const degraded = /DEGRADED/i.test(gate.out);
const passed = /No degradation detected/i.test(gate.out);
if (!degraded && !passed && gate.code === 0) {
  allow("⚠ Sentrux gate produced no recognizable verdict — architecture gate skipped.");
}

const opName = isPrCreate ? "PR" : isPush ? "push" : "commit";

// ---- Degradation → ASK the human (never auto-approve) ----
if (degraded || gate.code !== 0) {
  const detail = gate.out
    .split("\n")
    .filter((l) => /Quality:|Coupling:|Cycles:|God files:|complex|DEGRADED|✗|dropped|increased/i.test(l))
    .join("\n")
    .trim();
  ask(
    `Sentrux architecture gate: this ${opName} DEGRADES the saved baseline. ` +
      `It must not proceed without your explicit approval.\n\n` +
      `${detail || gate.out.trim()}\n\n` +
      `Approve only if you intend to accept the regression. Otherwise reject and restore the ` +
      `baseline first (remediation only — no new features):\n` +
      `  • quality drop / new god file → re-extract the flattened pattern into its proper module\n` +
      `  • new duplication → factor it back into the shared abstraction\n` +
      `  • new cycles / coupling up → break the cycle, restore the layering\n` +
      `Touch only the regressing files, keep tests green, then re-run \`sentrux gate .\`. ` +
      `Full playbook: Step 0 of the /pr-review command.`,
  );
}

// ---- Improvement → ratchet automatically across ALL tracked metrics ----
// Parse every printed metric. Quality is "higher better"; coupling, cycles and
// god files are "lower better". Improvement = at least one moved the good way
// and (sentrux already confirmed) none moved the bad way.
function metric(label) {
  const m = gate.out.match(new RegExp(`${label}:\\s*([\\d.]+)\\s*(?:->|→)\\s*([\\d.]+)`));
  return m ? { from: Number(m[1]), to: Number(m[2]) } : null;
}
const quality = metric("Quality");
const coupling = metric("Coupling");
const cycles = metric("Cycles");
const godFiles = metric("God files");

const improved =
  (quality && quality.to > quality.from) ||
  (coupling && coupling.to < coupling.from) ||
  (cycles && cycles.to < cycles.from) ||
  (godFiles && godFiles.to < godFiles.from);

if (improved) {
  const deltas = [];
  if (quality && quality.to !== quality.from) deltas.push(`quality ${quality.from}→${quality.to}`);
  if (coupling && coupling.to !== coupling.from) deltas.push(`coupling ${coupling.from}→${coupling.to}`);
  if (cycles && cycles.to !== cycles.from) deltas.push(`cycles ${cycles.from}→${cycles.to}`);
  if (godFiles && godFiles.to !== godFiles.from) deltas.push(`god-files ${godFiles.from}→${godFiles.to}`);
  const summary = deltas.join(", ") || "metrics improved";

  const save = run("sentrux gate . --save");
  if (save.code !== 0) {
    allow(`✓ Sentrux improved (${summary}) but \`--save\` failed; ratchet the baseline manually.`);
  }

  // On `git push` the hook runs before the push, so a fresh baseline commit
  // travels with it. On commit/PR-create, committing here would surprise the
  // user or land local-only — stage it and let the model commit instead.
  if (isPush) {
    const commit = run('git commit .sentrux/baseline.json -m "chore(sentrux): ratchet baseline"');
    if (commit.code === 0) {
      allow(`✓ Sentrux baseline ratcheted (${summary}) and committed automatically. Proceeding with push.`);
    }
  }
  run("git add .sentrux/baseline.json");
  allow(
    `✓ Sentrux improved (${summary}); baseline saved and staged. ` +
      `Commit it as \`chore(sentrux): ratchet baseline\` to lock in the gain.`,
  );
}

// ---- No degradation, no improvement → allow silently ----
allow();
