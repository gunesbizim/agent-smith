// A9 — generated permission system. Emits an enforceable per-project policy as Claude Code
// settings + a PreToolUse deny hook. Enforcement is the runtime's (Claude Code already honors
// settings.permissions and runs hooks); agent-smith only generates the policy artifacts.
import path from "node:path";
import fs from "fs-extra";
import type { DetectedProject } from "../shared/types.js";

export interface RolePolicy {
  /** Shell-command rules. */
  shell: {
    /** Commands explicitly allowed (used when allowlistMode is on). */
    allowed: string[];
    /** Command substrings/patterns that are always blocked. */
    denied: string[];
  };
  /** When true, only `allowed` shell commands may run (stricter, noisier). Default false. */
  allowlistMode: boolean;
}

// Dangerous operations blocked on every stack regardless of the project.
const ALWAYS_DENIED = [
  "rm -rf",
  "rm -fr",
  "git push --force",
  "git push -f",
  "git reset --hard",
  ":(){ :|:& };:", // fork bomb
  "chmod -R 777",
  "curl | sh",
  "curl | bash",
  "dd if=",
  "mkfs",
];

// Stack-aware allowlist seed (the safe everyday commands for the detected stack).
function stackAllowlist(project: DetectedProject): string[] {
  const lang = project.backend?.language;
  switch (lang) {
    case "go": return ["go test ./...", "go build ./...", "go vet ./...", "golangci-lint run"];
    case "rust": return ["cargo test", "cargo build", "cargo clippy", "cargo fmt"];
    case "python": return ["pytest", "ruff check .", "mypy ."];
    case "typescript":
    case "javascript": return ["npm test", "npm run build", "npm run lint", "npx vitest run"];
    case "java":
    case "kotlin": return ["mvn test", "./gradlew test", "./gradlew build"];
    default: return ["git status", "git diff"];
  }
}

/** A sensible default policy for the detected stack: deny-by-rule for dangerous ops, allowlist opt-in. */
export function defaultPolicy(project: DetectedProject): RolePolicy {
  return {
    shell: { allowed: stackAllowlist(project), denied: [...ALWAYS_DENIED] },
    allowlistMode: false,
  };
}

export type PermissionDecision = "allow" | "deny";

/** Evaluate a shell command against the policy (pure — shared by the hook and tests). */
export function evaluateCommand(command: string, policy: RolePolicy): { decision: PermissionDecision; reason?: string } {
  const cmd = command.trim();
  for (const rule of policy.shell.denied) {
    if (cmd.includes(rule)) {
      return { decision: "deny", reason: `blocked by policy: "${rule}" is a denied operation` };
    }
  }
  if (policy.allowlistMode) {
    const ok = policy.shell.allowed.some((a) => cmd.startsWith(a));
    if (!ok) return { decision: "deny", reason: "allowlist mode: command is not in the allowed list" };
  }
  return { decision: "allow" };
}

/**
 * Render the Claude Code settings.json `permissions` block from the policy. Denied operations
 * become `Bash(<rule>:*)` deny rules the runtime enforces directly (belt-and-braces with the hook).
 */
export function renderPermissionsBlock(policy: RolePolicy): { allow: string[]; deny: string[] } {
  // Claude Code's `Bash(<pattern>)` syntax can't represent a rule containing parentheses — the
  // parser reads the inner `(` as an empty-argument pattern and rejects the whole rule (e.g. the
  // fork bomb `:(){ :|:& };:`). Skip those here; they remain fully enforced by the PreToolUse
  // guard, which substring-matches against the same rules in permissions.json.
  const settingsExpressible = (rule: string) => !rule.includes("(");
  return {
    allow: policy.allowlistMode ? policy.shell.allowed.filter(settingsExpressible).map((c) => `Bash(${c})`) : [],
    deny: policy.shell.denied.filter(settingsExpressible).map((c) => `Bash(${c}:*)`),
  };
}

/** Where the deny hook reads the policy from. */
export function policyPath(projectRoot: string): string {
  return path.join(projectRoot, ".claude", "agent-smith", "permissions.json");
}

/** Write the policy file the PreToolUse guard reads. */
export async function writePermissionsPolicy(projectRoot: string, policy: RolePolicy, dryRun = false): Promise<void> {
  if (dryRun) return;
  const p = policyPath(projectRoot);
  await fs.ensureDir(path.dirname(p));
  await fs.writeJson(p, policy, { spaces: 2 });
}

/**
 * Generate the permission artifacts for a project: the policy file (read by the deny hook) and
 * the merged `permissions` block in .claude/settings.json (enforced by the runtime directly).
 */
export async function scaffoldPermissions(projectRoot: string, project: DetectedProject, dryRun = false): Promise<void> {
  const policy = defaultPolicy(project);
  await writePermissionsPolicy(projectRoot, policy, dryRun);
  if (dryRun) return;

  const settingsPath = path.join(projectRoot, ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) return;
  const settings = (await fs.readJson(settingsPath)) as Record<string, unknown>;
  const block = renderPermissionsBlock(policy);
  const existing = (settings.permissions as { allow?: string[]; deny?: string[] }) ?? {};
  settings.permissions = {
    ...existing,
    allow: Array.from(new Set([...(existing.allow ?? []), ...block.allow])),
    deny: Array.from(new Set([...(existing.deny ?? []), ...block.deny])),
  };
  await fs.writeJson(settingsPath, settings, { spaces: 2 });
}
