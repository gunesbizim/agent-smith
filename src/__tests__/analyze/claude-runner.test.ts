import { describe, it, expect, vi, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";

const execFileSyncMock = vi.fn();
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => execFileSyncMock(...args),
}));

import { runClaude, isClaudeAvailable } from "../../analyze/claude-runner.js";

describe("isClaudeAvailable", () => {
  beforeEach(() => execFileSyncMock.mockReset());

  it("returns true when `claude --version` succeeds", () => {
    execFileSyncMock.mockReturnValue("claude 1.0.0");
    expect(isClaudeAvailable()).toBe(true);
    expect(execFileSyncMock).toHaveBeenCalledWith("claude", ["--version"], expect.any(Object));
  });

  it("returns false when the binary is missing", () => {
    execFileSyncMock.mockImplementationOnce(() => { throw new Error("ENOENT"); });
    expect(isClaudeAvailable()).toBe(false);
  });
});

describe("runClaude", () => {
  beforeEach(() => execFileSyncMock.mockReset());

  it("passes the prompt and strict MCP config, returns stdout", () => {
    execFileSyncMock.mockReturnValue("model output");
    const out = runClaude("hello");
    expect(out).toBe("model output");
    const [bin, args] = execFileSyncMock.mock.calls[0];
    expect(bin).toBe("claude");
    expect(args).toEqual(expect.arrayContaining(["-p", "hello", "--strict-mcp-config", "--mcp-config"]));
  });

  it("appends allowedTools when provided", () => {
    execFileSyncMock.mockReturnValue("ok");
    runClaude("p", { allowedTools: ["Read", "Task"] });
    const [, args] = execFileSyncMock.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining(["--allowedTools", "Read", "Task"]));
  });

  it("does not append allowedTools when empty", () => {
    execFileSyncMock.mockReturnValue("ok");
    runClaude("p", { allowedTools: [] });
    const [, args] = execFileSyncMock.mock.calls[0];
    expect(args).not.toContain("--allowedTools");
  });

  it("uses the provided cwd verbatim (no scratch dir)", () => {
    execFileSyncMock.mockReturnValue("ok");
    runClaude("p", { cwd: "/my/project" });
    const opts = execFileSyncMock.mock.calls[0][2];
    expect(opts.cwd).toBe("/my/project");
  });

  it("passes --mcp-config <path> when mcpConfigPath is set and the file exists — P2", () => {
    execFileSyncMock.mockReturnValue("ok");
    const realPath = fileURLToPath(import.meta.url); // this test file exists
    runClaude("p", { mcpConfigPath: realPath });
    const [, args] = execFileSyncMock.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining(["--mcp-config", realPath]));
    expect(args).not.toContain('{"mcpServers":{}}');
    expect(args).toContain("--strict-mcp-config");
  });

  it("falls back to the empty-object MCP config when mcpConfigPath is missing — P2", () => {
    execFileSyncMock.mockReturnValue("ok");
    runClaude("p", { mcpConfigPath: "/does/not/exist/.mcp.json" });
    const [, args] = execFileSyncMock.mock.calls[0];
    expect(args).toContain('{"mcpServers":{}}');
    expect(args).not.toContain("/does/not/exist/.mcp.json");
  });

  it("appends --settings hooks override when suppressHooks is set — P2", () => {
    execFileSyncMock.mockReturnValue("ok");
    runClaude("p", { suppressHooks: true });
    const [, args] = execFileSyncMock.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining(["--settings", '{"hooks":{}}']));
  });

  it("no MCP/hook options → argv identical to today (regression guard) — P2", () => {
    execFileSyncMock.mockReturnValue("ok");
    runClaude("p");
    const [, args] = execFileSyncMock.mock.calls[0];
    expect(args).toEqual(["-p", "p", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}']);
  });

  it("returns null when the subprocess throws", () => {
    execFileSyncMock.mockImplementationOnce(() => { throw new Error("timeout"); });
    expect(runClaude("p")).toBeNull();
  });

  it("runs in a temp scratch dir when no cwd is given", () => {
    execFileSyncMock.mockReturnValue("ok");
    runClaude("p");
    const opts = execFileSyncMock.mock.calls[0][2];
    expect(typeof opts.cwd).toBe("string");
    expect(opts.cwd.length).toBeGreaterThan(0);
  });
});
