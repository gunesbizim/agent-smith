import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

const runClaudeMock = vi.fn();
// generateSkills now calls runClaudeDetailed; the mock wraps the legacy string/null return into a
// ClaudeRunResult, and passes through a full result object so tests can force status "timeout".
vi.mock("../../analyze/claude-runner.js", () => ({
  isClaudeAvailable: () => true,
  runClaude: (...args: unknown[]) => runClaudeMock(...args),
  runClaudeDetailed: (...args: unknown[]) => {
    const r = runClaudeMock(...args);
    if (r && typeof r === "object" && "status" in r) return r;
    return { text: r ?? null, status: r === null || r === undefined ? "error" : "ok", durationMs: 1 };
  },
}));

import { generateSkills, GENERATED_SKILLS, buildMasterSkillPrompt, skillsTimeoutMs, buildGroundingMcp } from "../../adapt/llm-skills.js";
import { writeMarker, markerPath } from "../../adapt/skill-gen-marker.js";

function scaffoldStubs(root: string): void {
  for (const s of GENERATED_SKILLS) {
    const dir = path.join(root, ".claude", "skills", s);
    fs.ensureDirSync(dir);
    fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${s}\n---\nstub\n`);
  }
  fs.ensureDirSync(path.join(root, "docs", "architecture"));
  fs.writeFileSync(path.join(root, "docs", "architecture", "backend-architecture.md"), "# Backend\n");
}

describe("generateSkills", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "llmskills-"));
    runClaudeMock.mockReset();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("returns ran:false when stubs are not scaffolded", () => {
    const r = generateSkills(tmp);
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/stub/i);
    expect(runClaudeMock).not.toHaveBeenCalled();
  });

  it("returns ran:false when architecture docs are missing", () => {
    for (const s of GENERATED_SKILLS) {
      const dir = path.join(tmp, ".claude", "skills", s);
      fs.ensureDirSync(dir);
      fs.writeFileSync(path.join(dir, "SKILL.md"), "stub");
    }
    const r = generateSkills(tmp);
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/architecture/i);
  });

  it("runs the LLM and reports ran:true with a summary when prerequisites exist", () => {
    scaffoldStubs(tmp);
    runClaudeMock.mockReturnValue("did stuff\nRewrote 6 skills grounded in FastAPI + React.");
    const r = generateSkills(tmp);
    expect(r.ran).toBe(true);
    expect(r.summary).toContain("FastAPI");
    expect(runClaudeMock).toHaveBeenCalledOnce();
    // It must be invoked with subagent + write tools enabled.
    const opts = runClaudeMock.mock.calls[0][1];
    expect(opts.allowedTools).toEqual(expect.arrayContaining(["Task", "Write", "Read"]));
  });

  it("proceeds for a frontend-only project (only frontend-architecture.md present) — P5", () => {
    for (const s of GENERATED_SKILLS) {
      const dir = path.join(tmp, ".claude", "skills", s);
      fs.ensureDirSync(dir);
      fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${s}\n---\nstub\n`);
    }
    fs.ensureDirSync(path.join(tmp, "docs", "architecture"));
    fs.writeFileSync(path.join(tmp, "docs", "architecture", "frontend-architecture.md"), "# Frontend\n");
    runClaudeMock.mockReturnValue("Rewrote 6 skills grounded in React/Zustand.");
    const r = generateSkills(tmp);
    expect(r.ran).toBe(true);
    expect(runClaudeMock).toHaveBeenCalledOnce();
  });

  it("returns ran:false when NO architecture doc exists at all — P5 regression", () => {
    for (const s of GENERATED_SKILLS) {
      const dir = path.join(tmp, ".claude", "skills", s);
      fs.ensureDirSync(dir);
      fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${s}\n---\nstub\n`);
    }
    fs.ensureDirSync(path.join(tmp, "docs", "architecture"));
    const r = generateSkills(tmp);
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/architecture/i);
    expect(runClaudeMock).not.toHaveBeenCalled();
  });

  it("returns ran:false when the LLM call fails", () => {
    scaffoldStubs(tmp);
    runClaudeMock.mockReturnValue(null);
    const r = generateSkills(tmp);
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/failed|unavailable/i);
  });

  it("reports an actionable timeout reason (not 'unavailable') when the run times out", () => {
    scaffoldStubs(tmp);
    runClaudeMock.mockReturnValue({ text: null, status: "timeout", durationMs: 1 });
    const r = generateSkills(tmp);
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/timed out/i);
    expect(r.reason).toMatch(/AGENT_SMITH_SKILLS_TIMEOUT_MS/);
  });

  // ---- P3: first-run gate + MCP/hook wiring ----

  it("skips generation when the marker is present and regen is not set — P3", () => {
    scaffoldStubs(tmp);
    writeMarker(tmp, { generatedAt: "2026-06-17T00:00:00.000Z" });
    const r = generateSkills(tmp);
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/already generated/i);
    expect(runClaudeMock).not.toHaveBeenCalled();
  });

  it("bypasses the marker gate when regen:true — P3", () => {
    scaffoldStubs(tmp);
    writeMarker(tmp, { generatedAt: "2026-06-17T00:00:00.000Z" });
    runClaudeMock.mockReturnValue("Rewrote 6 skills.");
    const r = generateSkills(tmp, { regen: true });
    expect(r.ran).toBe(true);
    expect(runClaudeMock).toHaveBeenCalledOnce();
  });

  it("boots a temp grounding MCP config + sets suppressHooks when code-intel servers are configured", () => {
    scaffoldStubs(tmp);
    fs.outputJsonSync(path.join(tmp, ".claude", "settings.json"), { mcpServers: { gitnexus: {} } });
    runClaudeMock.mockReturnValue("done");
    generateSkills(tmp, { useProjectMcp: true, suppressHooks: true });
    const opts = runClaudeMock.mock.calls[0][1] as { mcpConfigPath?: string; suppressHooks?: boolean };
    expect(typeof opts.mcpConfigPath).toBe("string"); // a temp strict config, not the raw .mcp.json
    expect(opts.mcpConfigPath).not.toBe(path.join(tmp, ".mcp.json"));
    expect(opts.suppressHooks).toBe(true);
  });

  it("permits code-intel/doc MCP tools from BOTH .mcp.json and settings.json (not browser)", () => {
    scaffoldStubs(tmp);
    fs.writeJsonSync(path.join(tmp, ".mcp.json"), { mcpServers: { playwright: {} } });
    fs.outputJsonSync(path.join(tmp, ".claude", "settings.json"), { mcpServers: { gitnexus: {}, serena: {} } });
    runClaudeMock.mockReturnValue("done");
    generateSkills(tmp, { useProjectMcp: true });
    const opts = runClaudeMock.mock.calls[0][1] as { allowedTools: string[] };
    expect(opts.allowedTools).toEqual(expect.arrayContaining(["mcp__gitnexus", "mcp__serena"]));
    expect(opts.allowedTools).not.toContain("mcp__playwright");
  });

  it("adds no MCP tools when useProjectMcp is unset", () => {
    scaffoldStubs(tmp);
    fs.writeJsonSync(path.join(tmp, ".mcp.json"), { mcpServers: { gitnexus: {} } });
    runClaudeMock.mockReturnValue("done");
    generateSkills(tmp);
    const opts = runClaudeMock.mock.calls[0][1] as { allowedTools: string[] };
    expect(opts.allowedTools.some((t) => t.startsWith("mcp__"))).toBe(false);
  });

  it("does not pass an mcpConfigPath when useProjectMcp is unset — P3", () => {
    scaffoldStubs(tmp);
    runClaudeMock.mockReturnValue("done");
    generateSkills(tmp);
    const opts = runClaudeMock.mock.calls[0][1];
    expect(opts.mcpConfigPath).toBeUndefined();
  });

  it("does not itself write the marker (the caller owns the clock) — P3", () => {
    scaffoldStubs(tmp);
    runClaudeMock.mockReturnValue("done");
    generateSkills(tmp);
    expect(fs.existsSync(markerPath(tmp))).toBe(false);
  });
});

describe("buildGroundingMcp", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "grounding-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("merges code-intel/doc servers from .mcp.json AND .claude/settings.json, excludes browser/quality", () => {
    // Mirrors how agent-smith configures: browser servers in .mcp.json, code-intel in settings.json.
    fs.writeJsonSync(path.join(dir, ".mcp.json"), { mcpServers: { playwright: {}, "chrome-devtools": {}, obsidian: { command: "x" } } });
    fs.outputJsonSync(path.join(dir, ".claude", "settings.json"), { mcpServers: { gitnexus: { command: "g" }, serena: {}, "git-memory": {}, sentrux: {} } });
    const g = buildGroundingMcp(dir);
    expect(g.allow).toEqual(expect.arrayContaining(["mcp__gitnexus", "mcp__serena", "mcp__git-memory", "mcp__obsidian"]));
    expect(g.allow).not.toContain("mcp__playwright");
    expect(g.allow).not.toContain("mcp__chrome-devtools");
    expect(g.allow).not.toContain("mcp__sentrux"); // quality category
    expect(Object.keys(g.servers)).toEqual(expect.arrayContaining(["gitnexus", "serena", "git-memory", "obsidian"]));
    expect(g.servers.gitnexus).toEqual({ command: "g" }); // carries the real config through
  });

  it("returns empty when nothing is configured", () => {
    expect(buildGroundingMcp(dir)).toEqual({ servers: {}, allow: [] });
  });
});

describe("skillsTimeoutMs", () => {
  const orig = process.env.AGENT_SMITH_SKILLS_TIMEOUT_MS;
  afterEach(() => {
    if (orig === undefined) delete process.env.AGENT_SMITH_SKILLS_TIMEOUT_MS;
    else process.env.AGENT_SMITH_SKILLS_TIMEOUT_MS = orig;
  });
  it("defaults to 20 minutes", () => {
    delete process.env.AGENT_SMITH_SKILLS_TIMEOUT_MS;
    expect(skillsTimeoutMs()).toBe(1_200_000);
  });
  it("honors a valid override and ignores garbage/non-positive values", () => {
    process.env.AGENT_SMITH_SKILLS_TIMEOUT_MS = "2400000";
    expect(skillsTimeoutMs()).toBe(2_400_000);
    process.env.AGENT_SMITH_SKILLS_TIMEOUT_MS = "abc";
    expect(skillsTimeoutMs()).toBe(1_200_000);
    process.env.AGENT_SMITH_SKILLS_TIMEOUT_MS = "0";
    expect(skillsTimeoutMs()).toBe(1_200_000);
  });
});

describe("buildMasterSkillPrompt", () => {
  it("instructs understand-first then fan-out subagents, listing every skill", () => {
    const p = buildMasterSkillPrompt("/proj");
    expect(p).toMatch(/Understand the project/i);
    expect(p).toMatch(/Task tool/i);
    expect(p).toMatch(/subagent/i);
    for (const s of GENERATED_SKILLS) expect(p).toContain(s);
    // Must steer the model to PREFER MCP tools when grabbing code/docs.
    expect(p).toMatch(/PREFER MCP tools|MCP-first/i);
    expect(p).toMatch(/gitnexus[\s\S]*serena/i);
    // Must warn against leaving wrong-stack rules / unresolved template vars.
    expect(p).toMatch(/NEVER leave a rule that does not apply/i);
    expect(p).toMatch(/\{\{TEMPLATE_VARS\}\}|unresolved braces/i);
  });

  it("enforces Serena tool correctness (no phantom tools, slash name paths)", () => {
    const p = buildMasterSkillPrompt("/proj");
    expect(p).toMatch(/Serena correctness/i);
    expect(p).toContain("find_implementations");
    expect(p).toContain("get_diagnostics_for_file");
    expect(p).toMatch(/NO find_implementations|never emit those/i);
    expect(p).toMatch(/'\/' not '\.'|name paths use/i);
    expect(p).toMatch(/find_referencing_symbols requires BOTH/i);
  });
});
