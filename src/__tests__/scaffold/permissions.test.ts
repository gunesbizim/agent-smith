// A9 — generated permission system: policy evaluation, settings block, and the real deny hook.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import fs from "fs-extra";
import {
  defaultPolicy, evaluateCommand, renderPermissionsBlock, scaffoldPermissions, policyPath,
} from "../../scaffold/permissions.js";
import type { DetectedProject } from "../../shared/types.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const hookPath = path.join(repoRoot, "hooks", "pre-tool-permission-guard.js");

function project(lang: string): DetectedProject {
  return {
    rootPath: "/x", projectType: "web-app",
    backend: { language: lang } as unknown as DetectedProject["backend"],
    frontend: null, testing: { backend: null, frontend: null }, linting: { backend: null, frontend: null },
    cicd: null, monorepo: null, database: null,
  };
}

describe("permission policy (A9)", () => {
  it("denies dangerous ops and allows safe ones", () => {
    const policy = defaultPolicy(project("go"));
    expect(evaluateCommand("rm -rf /tmp/x", policy).decision).toBe("deny");
    expect(evaluateCommand("git push --force origin main", policy).decision).toBe("deny");
    expect(evaluateCommand("go test ./...", policy).decision).toBe("allow");
  });

  it("seeds a stack-aware allowlist", () => {
    expect(defaultPolicy(project("go")).shell.allowed).toContain("go test ./...");
    expect(defaultPolicy(project("rust")).shell.allowed).toContain("cargo test");
    expect(defaultPolicy(project("typescript")).shell.allowed).toContain("npm test");
  });

  it("allowlist mode denies a command not in the allowed list", () => {
    const policy = { ...defaultPolicy(project("go")), allowlistMode: true };
    expect(evaluateCommand("curl http://evil", policy).decision).toBe("deny");
    expect(evaluateCommand("go test ./...", policy).decision).toBe("allow");
  });

  it("renders a settings.json permissions block with Bash deny rules", () => {
    const block = renderPermissionsBlock(defaultPolicy(project("go")));
    expect(block.deny).toContain("Bash(rm -rf:*)");
  });

  it("omits rules that contain parentheses (invalid in Bash() patterns)", () => {
    const block = renderPermissionsBlock(defaultPolicy(project("go")));
    // The fork bomb `:(){ :|:& };:` cannot be expressed as a Bash() rule — Claude Code rejects
    // the empty parens — so it must not appear in settings (the hook still enforces it).
    expect(block.deny.some((r) => r.includes("(){"))).toBe(false);
    expect(block.deny).not.toContain("Bash(:(){ :|:& };::*)");
  });
});

describe("scaffoldPermissions (A9)", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "perm-")); });
  afterEach(() => { fs.removeSync(tmp); });

  it("writes the policy file and merges the permissions block into settings.json", async () => {
    fs.ensureDirSync(path.join(tmp, ".claude"));
    fs.writeJsonSync(path.join(tmp, ".claude", "settings.json"), { existing: true });
    await scaffoldPermissions(tmp, project("go"));
    expect(fs.existsSync(policyPath(tmp))).toBe(true);
    const settings = fs.readJsonSync(path.join(tmp, ".claude", "settings.json"));
    expect(settings.permissions.deny).toContain("Bash(rm -rf:*)");
    expect(settings.existing).toBe(true); // preserved
  });
});

describe("pre-tool-permission-guard hook (A9, integration)", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "permhook-"));
    await scaffoldPermissions(tmp, project("go"));
  });
  afterEach(() => { fs.removeSync(tmp); });

  function runHook(command: string): { permissionDecision?: string } {
    const input = JSON.stringify({ tool_input: { command }, cwd: tmp });
    const out = execFileSync("node", [hookPath], { input, encoding: "utf-8" });
    return JSON.parse(out).hookSpecificOutput;
  }

  it("denies a denied command", () => {
    expect(runHook("rm -rf /tmp/x").permissionDecision).toBe("deny");
  });

  it("allows a safe command (no permissionDecision = allow)", () => {
    expect(runHook("go test ./...").permissionDecision).toBeUndefined();
  });

  it("still denies the fork bomb even though it isn't in the settings block", () => {
    expect(runHook(":(){ :|:& };:").permissionDecision).toBe("deny");
  });
});
