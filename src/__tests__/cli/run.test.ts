import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

vi.mock("../../engine/tdd-engine.js", () => ({
  runEngine: vi.fn(async () => ({ runId: "rid-123", state: { status: "completed", phasesCompleted: ["understand", "red"] } })),
}));
vi.mock("../../analyze/claude-runner.js", () => ({ isClaudeAvailable: vi.fn(() => true) }));
vi.mock("../../jira/ticket-parser.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, fetchJiraTicket: vi.fn(() => null) };
});

import { runCommand } from "../../cli/run.js";
import { runEngine } from "../../engine/tdd-engine.js";
import { isClaudeAvailable } from "../../analyze/claude-runner.js";
import { fetchJiraTicket } from "../../jira/ticket-parser.js";

const mockRunEngine = vi.mocked(runEngine);
const mockClaude = vi.mocked(isClaudeAvailable);
const mockFetch = vi.mocked(fetchJiraTicket);

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "as-runcli-"));
  mockRunEngine.mockClear();
  mockClaude.mockReturnValue(true);
  mockFetch.mockReturnValue(null);
  process.exitCode = undefined;
});
afterEach(() => fs.removeSync(root));

describe("runCommand", () => {
  it("drives the engine for a free-text task", async () => {
    await runCommand("add CSV export", { dir: root, auto: true });
    expect(mockRunEngine).toHaveBeenCalledOnce();
    const [input] = mockRunEngine.mock.calls[0];
    expect(input.ticketId).toBeNull();
    expect(input.task).toBe("add CSV export");
    expect(input.approvalGate).toBe("none");
    expect(input.testCommand).toBe("none");
  });

  it("fetches a Jira ticket and feeds its summary to the engine", async () => {
    mockFetch.mockReturnValue({
      key: "PROJ-7",
      summary: "Add CSV export",
      description: "As a user...",
      acceptanceCriteria: ["downloads csv"],
      issueType: "story",
      status: "To Do",
      assignee: null,
      sprint: null,
      epic: null,
    });
    await runCommand("PROJ-7", { dir: root, auto: true });
    const [input] = mockRunEngine.mock.calls[0];
    expect(input.ticketId).toBe("PROJ-7");
    expect(input.task).toContain("Add CSV export");
    expect(input.branch).toBe("feat/PROJ-7-add-csv-export");
  });

  it("falls back to a task seed when Jira is unreachable", async () => {
    await runCommand("PROJ-9", { dir: root, auto: true });
    const [input] = mockRunEngine.mock.calls[0];
    expect(input.ticketId).toBe("PROJ-9");
    expect(input.task).toMatch(/Implement Jira ticket PROJ-9/);
  });

  it("reads the test command from config.json", async () => {
    fs.outputJsonSync(path.join(root, ".claude", "agent-smith", "config.json"), { testCommand: "pytest -q" });
    await runCommand("task", { dir: root, auto: true });
    expect(mockRunEngine.mock.calls[0][0].testCommand).toBe("pytest -q");
  });

  it("prefers the --test-cmd flag over config", async () => {
    fs.outputJsonSync(path.join(root, ".claude", "agent-smith", "config.json"), { testCommand: "pytest" });
    await runCommand("task", { dir: root, auto: true, testCmd: "npm test" });
    expect(mockRunEngine.mock.calls[0][0].testCommand).toBe("npm test");
  });

  it("aborts (no engine run) when the claude CLI is missing", async () => {
    mockClaude.mockReturnValue(false);
    await runCommand("task", { dir: root, auto: true });
    expect(mockRunEngine).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("maps approval flags to the gate", async () => {
    await runCommand("task", { dir: root, approveAll: true });
    expect(mockRunEngine.mock.calls[0][0].approvalGate).toBe("all");
    mockRunEngine.mockClear();
    await runCommand("task", { dir: root });
    expect(mockRunEngine.mock.calls[0][0].approvalGate).toBe("plan");
  });
});
