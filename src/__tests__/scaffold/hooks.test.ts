import { describe, it, expect } from "vitest";
import { buildHookConfig } from "../../scaffold/hooks.js";

describe("buildHookConfig", () => {
  const cfg = buildHookConfig("/proj", "/proj/hooks");
  const bash = cfg.PreToolUse!.find((e) => e.matcher === "Bash")!;
  const bashCmds = bash.hooks.map((h) => h.command);

  it("keeps every existing PreToolUse(Bash) hook (backward compat)", () => {
    expect(bashCmds.some((c) => c.includes("pre-tool-permission-guard.js"))).toBe(true);
    expect(bashCmds.some((c) => c.includes("pre-tool-git-guard.js"))).toBe(true);
    expect(bashCmds.some((c) => c.includes("pre-tool-sentrux-gate.js"))).toBe(true);
  });

  it("registers the new TDD gate BEFORE the sentrux gate", () => {
    const tdd = bashCmds.findIndex((c) => c.includes("pre-tool-tdd-gate.js"));
    const sentrux = bashCmds.findIndex((c) => c.includes("pre-tool-sentrux-gate.js"));
    expect(tdd).toBeGreaterThanOrEqual(0);
    expect(tdd).toBeLessThan(sentrux);
  });

  it("registers the all-tools telemetry PostToolUse hook with broad matcher", () => {
    const allTools = cfg.PostToolUse!.find((e) => e.matcher === ".*");
    expect(allTools).toBeTruthy();
    expect(allTools!.hooks[0].command).toContain("post-tool-agent-telemetry.js");
  });

  it("preserves the caveman memory suspend/resume hooks", () => {
    expect(cfg.PreToolUse!.some((e) => e.matcher.includes("mempalace"))).toBe(true);
    expect(cfg.PostToolUse!.some((e) => e.matcher.includes("mempalace"))).toBe(true);
  });

  it("keeps the SessionStart doctor and Stop change-detector", () => {
    expect(cfg.SessionStart![0].hooks[0].command).toContain("session-start-doctor.js");
    expect(cfg.Stop![0].hooks[0].command).toContain("stop-change-detector.js");
  });

  it("registers the PreCompact handoff-snapshot hook", () => {
    expect(cfg.PreCompact![0].hooks[0].command).toContain("pre-compact-handoff.js");
  });

  it("registers the UserPromptSubmit context-handoff nudge hook", () => {
    expect(cfg.UserPromptSubmit![0].hooks[0].command).toContain("user-prompt-handoff-nudge.js");
  });
});
