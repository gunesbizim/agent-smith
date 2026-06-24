import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the headless runner so the Jira fetch is hermetic (no claude spawn, no network).
vi.mock("../../analyze/claude-runner.js", () => ({ runClaude: vi.fn() }));
import { runClaude } from "../../analyze/claude-runner.js";
import { fetchJiraTicket, looksLikeTicketId, mapWorkflowToBranch } from "../../jira/ticket-parser.js";

const mockRun = vi.mocked(runClaude);
beforeEach(() => mockRun.mockReset());

describe("looksLikeTicketId", () => {
  it("recognizes Jira keys but not free text", () => {
    expect(looksLikeTicketId("PROJ-123")).toBe(true);
    expect(looksLikeTicketId("AB12-9")).toBe(true);
    expect(looksLikeTicketId("add CSV export")).toBe(false);
    expect(looksLikeTicketId("proj-1")).toBe(false);
  });
});

describe("fetchJiraTicket", () => {
  it("returns null when Jira is unreachable (headless MCP absent)", () => {
    mockRun.mockReturnValue(null);
    expect(fetchJiraTicket("PROJ-1", "/repo")).toBeNull();
  });

  it("returns null when the agent reports unavailable", () => {
    mockRun.mockReturnValue('{"error":"unavailable"}');
    expect(fetchJiraTicket("PROJ-1", "/repo")).toBeNull();
  });

  it("parses a fenced JSON ticket and normalizes fields", () => {
    mockRun.mockReturnValue(
      'Here you go:\n```json\n{"key":"PROJ-7","summary":"Add CSV export","description":"As a user...","acceptanceCriteria":["downloads csv"],"issueType":"story","status":"To Do"}\n```',
    );
    const t = fetchJiraTicket("PROJ-7", "/repo")!;
    expect(t.summary).toBe("Add CSV export");
    expect(t.acceptanceCriteria).toEqual(["downloads csv"]);
    expect(mapWorkflowToBranch(t).branchName).toBe("feat/PROJ-7-add-csv-export");
  });

  it("defaults an unknown issueType to story", () => {
    mockRun.mockReturnValue('{"key":"X-1","summary":"s","issueType":"weird"}');
    expect(fetchJiraTicket("X-1", "/repo")!.issueType).toBe("story");
  });
});
