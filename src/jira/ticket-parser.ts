// Jira integration — ticket parser, epic decomposer, workflow mapper
import type { JiraTicket, DecomposedTask } from "../shared/types.js";

export async function parseJiraTicket(ticketId: string): Promise<JiraTicket> {
  // In production, this calls the Jira MCP to fetch the ticket
  // For now, return a structured placeholder
  return {
    key: ticketId,
    summary: "",
    description: "",
    acceptanceCriteria: [],
    issueType: "story",
    status: "",
    assignee: null,
    sprint: null,
    epic: null,
  };
}

export function decomposeEpic(ticket: JiraTicket): DecomposedTask[] {
  // Break an epic into implementable sub-tasks based on acceptance criteria
  const tasks: DecomposedTask[] = [];

  for (const ac of ticket.acceptanceCriteria) {
    tasks.push({
      key: `${ticket.key}-${tasks.length + 1}`,
      summary: ac.substring(0, 80),
      description: ac,
      technicalScope: {
        backendFiles: [],
        frontendFiles: [],
        newEndpoints: [],
        newComponents: [],
        databaseChanges: false,
      },
      estimatedComplexity: "medium",
      dependencies: tasks.length > 0 ? [tasks[tasks.length - 1].key] : [],
    });
  }

  return tasks;
}

export function mapWorkflowToBranch(ticket: JiraTicket): {
  branchName: string;
  commitPrefix: string;
  prTitle: string;
} {
  const slug = ticket.summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 40);

  const type = ticket.issueType === "bug" ? "fix" : "feat";
  const branchName = `${type}/${ticket.key}-${slug}`;
  const commitPrefix = `${type}: ${ticket.key}`;
  const prTitle = `${ticket.key}: ${ticket.summary}`;

  return { branchName, commitPrefix, prTitle };
}

export function extractTechnicalRequirements(description: string): {
  endpoints: string[];
  components: string[];
  databaseChanges: boolean;
  constraints: string[];
} {
  const endpoints: string[] = [];
  const components: string[] = [];
  let databaseChanges = false;
  const constraints: string[] = [];

  const lines = description.split("\n");
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (trimmed.includes("endpoint") || trimmed.includes("api") || trimmed.includes("route")) {
      endpoints.push(line.trim());
    }
    if (trimmed.includes("component") || trimmed.includes("view") || trimmed.includes("page")) {
      components.push(line.trim());
    }
    if (trimmed.includes("migration") || trimmed.includes("schema") || trimmed.includes("table")) {
      databaseChanges = true;
    }
    if (trimmed.startsWith("constraint:") || trimmed.startsWith("note:")) {
      constraints.push(line.trim());
    }
  }

  return { endpoints, components, databaseChanges, constraints };
}
