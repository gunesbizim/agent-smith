import { describe, it, expect } from "vitest";
import {
  parseJiraTicket,
  decomposeEpic,
  mapWorkflowToBranch,
  extractTechnicalRequirements,
} from "../../jira/ticket-parser.js";

describe("Ticket Parser", () => {
  describe("parseJiraTicket", () => {
    it("returns a JiraTicket with correct key", async () => {
      const ticket = await parseJiraTicket("PROJ-123");
      expect(ticket.key).toBe("PROJ-123");
    });

    it("returns a JiraTicket with expected shape", async () => {
      const ticket = await parseJiraTicket("PROJ-42");
      expect(ticket).toHaveProperty("key");
      expect(ticket).toHaveProperty("summary");
      expect(ticket).toHaveProperty("description");
      expect(ticket).toHaveProperty("acceptanceCriteria");
      expect(ticket).toHaveProperty("issueType");
      expect(ticket).toHaveProperty("status");
      expect(ticket).toHaveProperty("assignee");
      expect(ticket).toHaveProperty("sprint");
      expect(ticket).toHaveProperty("epic");
    });

    it("acceptanceCriteria is an array", async () => {
      const ticket = await parseJiraTicket("PROJ-1");
      expect(Array.isArray(ticket.acceptanceCriteria)).toBe(true);
    });

    it("issueType is one of the valid types", async () => {
      const ticket = await parseJiraTicket("PROJ-1");
      expect(["story", "bug", "task", "epic"]).toContain(ticket.issueType);
    });
  });

  describe("decomposeEpic", () => {
    it("returns empty array for empty acceptance criteria", () => {
      const ticket = {
        key: "EPIC-1",
        summary: "Big feature",
        description: "",
        acceptanceCriteria: [],
        issueType: "epic" as const,
        status: "To Do",
        assignee: null,
        sprint: null,
        epic: null,
      };
      expect(decomposeEpic(ticket)).toEqual([]);
    });

    it("creates one task per acceptance criterion", () => {
      const ticket = {
        key: "EPIC-1",
        summary: "Big feature",
        description: "",
        acceptanceCriteria: ["AC1: Login page", "AC2: Dashboard", "AC3: Settings"],
        issueType: "epic" as const,
        status: "To Do",
        assignee: null,
        sprint: null,
        epic: null,
      };
      const tasks = decomposeEpic(ticket);
      expect(tasks).toHaveLength(3);
      expect(tasks[0].key).toBe("EPIC-1-1");
      expect(tasks[1].key).toBe("EPIC-1-2");
      expect(tasks[2].key).toBe("EPIC-1-3");
    });

    it("tasks chain dependencies", () => {
      const ticket = {
        key: "EPIC-1",
        summary: "Big feature",
        description: "",
        acceptanceCriteria: ["AC1", "AC2"],
        issueType: "epic" as const,
        status: "To Do",
        assignee: null,
        sprint: null,
        epic: null,
      };
      const tasks = decomposeEpic(ticket);
      expect(tasks[0].dependencies).toEqual([]);
      expect(tasks[1].dependencies).toEqual(["EPIC-1-1"]);
    });

    it("truncates long AC to 80 chars for summary", () => {
      const longAC = "A".repeat(200);
      const ticket = {
        key: "EPIC-1",
        summary: "Big feature",
        description: "",
        acceptanceCriteria: [longAC],
        issueType: "epic" as const,
        status: "To Do",
        assignee: null,
        sprint: null,
        epic: null,
      };
      const tasks = decomposeEpic(ticket);
      expect(tasks[0].summary.length).toBeLessThanOrEqual(80);
    });
  });

  describe("mapWorkflowToBranch", () => {
    it("creates branch name from ticket", () => {
      const ticket = {
        key: "PROJ-55",
        summary: "Add OAuth login",
        description: "",
        acceptanceCriteria: [],
        issueType: "story" as const,
        status: "To Do",
        assignee: null,
        sprint: null,
        epic: null,
      };
      const result = mapWorkflowToBranch(ticket);
      expect(result.branchName).toContain("PROJ-55");
      expect(result.branchName).toContain("add-oauth-login");
      expect(result.commitPrefix).toBe("feat: PROJ-55");
      expect(result.prTitle).toBe("PROJ-55: Add OAuth login");
    });

    it("uses 'fix' prefix for bug tickets", () => {
      const ticket = {
        key: "BUG-10",
        summary: "Fix crash on null input",
        description: "",
        acceptanceCriteria: [],
        issueType: "bug" as const,
        status: "To Do",
        assignee: null,
        sprint: null,
        epic: null,
      };
      const result = mapWorkflowToBranch(ticket);
      expect(result.branchName).toContain("fix/BUG-10");
      expect(result.commitPrefix).toBe("fix: BUG-10");
    });

    it("slugifies special characters in summary", () => {
      const ticket = {
        key: "TEST-1",
        summary: "Feature with spaces & special chars!!!",
        description: "",
        acceptanceCriteria: [],
        issueType: "story" as const,
        status: "To Do",
        assignee: null,
        sprint: null,
        epic: null,
      };
      const result = mapWorkflowToBranch(ticket);
      expect(result.branchName).not.toContain(" ");
      expect(result.branchName).not.toContain("&");
      expect(result.branchName).not.toContain("!");
    });

    it("truncates long summaries in branch name", () => {
      const ticket = {
        key: "PROJ-1",
        summary: "A very long summary that goes on and on about many details of the feature",
        description: "",
        acceptanceCriteria: [],
        issueType: "story" as const,
        status: "To Do",
        assignee: null,
        sprint: null,
        epic: null,
      };
      const result = mapWorkflowToBranch(ticket);
      // slug portion truncated to 40 chars
      const slug = result.branchName.split("PROJ-1-")[1];
      expect(slug.length).toBeLessThanOrEqual(40);
    });
  });

  describe("extractTechnicalRequirements", () => {
    it("extracts endpoints from description", () => {
      const desc = `
        This feature adds a new endpoint for user profile.
        API route: GET /api/users/:id/profile
        Another endpoint: PATCH /api/users/:id
      `;
      const result = extractTechnicalRequirements(desc);
      expect(result.endpoints.length).toBeGreaterThan(0);
    });

    it("extracts components from description", () => {
      const desc = `
        Need a new ProfileView component.
        Also update the Dashboard component.
      `;
      const result = extractTechnicalRequirements(desc);
      expect(result.components.length).toBeGreaterThan(0);
    });

    it("detects database changes", () => {
      const desc = "Add migration for new user_preferences table";
      const result = extractTechnicalRequirements(desc);
      expect(result.databaseChanges).toBe(true);
    });

    it("detects no database changes for pure UI work", () => {
      const desc = "Update button color in the header component";
      const result = extractTechnicalRequirements(desc);
      expect(result.databaseChanges).toBe(false);
    });

    it("extracts constraints", () => {
      const desc = `
        Constraint: must work with existing auth system
        Note: don't change the login flow
      `;
      const result = extractTechnicalRequirements(desc);
      expect(result.constraints.length).toBeGreaterThan(0);
    });

    it("handles empty description", () => {
      const result = extractTechnicalRequirements("");
      expect(result.endpoints).toEqual([]);
      expect(result.components).toEqual([]);
      expect(result.databaseChanges).toBe(false);
      expect(result.constraints).toEqual([]);
    });
  });
});
