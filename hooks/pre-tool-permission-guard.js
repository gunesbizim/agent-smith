#!/usr/bin/env node
// A9 — PreToolUse permission guard. Reads the generated policy at
// .claude/agent-smith/permissions.json and DENIES a Bash command that matches a denied rule
// (or, in allowlist mode, that isn't in the allowed list). Deterministic, zero-LLM, zero-token.
//
// Emits Claude Code's PreToolUse decision contract:
//   { hookSpecificOutput: { hookEventName, permissionDecision: "deny"|"allow", permissionDecisionReason } }
// Fails open (allow) on any error so a missing/corrupt policy never bricks the session.
import fs from "node:fs";
import path from "node:path";

const PRE = "PreToolUse";

function emit(obj) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: PRE, ...obj } }));
  process.exit(0);
}

let toolCall = {};
try {
  const raw = fs.readFileSync(0, "utf-8").trim();
  if (raw) toolCall = JSON.parse(raw);
} catch {
  /* no stdin */
}
const command = (toolCall.tool_input?.command || toolCall.command || "").trim();
if (!command) emit({}); // nothing to evaluate

// Locate the policy relative to the project root (cwd of the tool call).
const root = toolCall.cwd || process.cwd();
const policyFile = path.join(root, ".claude", "agent-smith", "permissions.json");

let policy = null;
try {
  policy = JSON.parse(fs.readFileSync(policyFile, "utf-8"));
} catch {
  emit({}); // no policy → allow (fail open)
}

const denied = Array.isArray(policy?.shell?.denied) ? policy.shell.denied : [];
for (const rule of denied) {
  if (command.includes(rule)) {
    emit({
      permissionDecision: "deny",
      permissionDecisionReason: `Blocked by agent-smith policy: "${rule}" is a denied operation.`,
    });
  }
}

if (policy?.allowlistMode) {
  const allowed = Array.isArray(policy?.shell?.allowed) ? policy.shell.allowed : [];
  const ok = allowed.some((a) => command.startsWith(a));
  if (!ok) {
    emit({
      permissionDecision: "deny",
      permissionDecisionReason: "Blocked by agent-smith policy: allowlist mode — command is not in the allowed list.",
    });
  }
}

emit({}); // allow
