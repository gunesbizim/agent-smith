// Jira integration — ticket parser, epic decomposer, workflow mapper
import path from "node:path";
import { runClaude } from "../analyze/claude-runner.js";
import type { JiraTicket, DecomposedTask } from "../shared/types.js";

/** A Jira issue key like PROJ-123 (vs a free-text task). */
export function looksLikeTicketId(input: string): boolean {
  return /^[A-Z][A-Z0-9]+-\d+$/.test(input.trim());
}

/**
 * Best-effort live fetch via the Atlassian MCP, run headlessly in the project (so the project's
 * .mcp.json servers boot). Returns null when Jira is unreachable — e.g. the claude.ai Atlassian
 * server requires interactive auth and may be absent headless — so the caller can fall back to
 * treating the input as a task and letting the UNDERSTAND phase fetch details if it can.
 */
export function fetchJiraTicket(ticketId: string, projectRoot: string): JiraTicket | null {
  const prompt =
    `Fetch Jira issue ${ticketId} using the Atlassian MCP (getJiraIssue / searchJiraIssuesUsingJql). ` +
    `Return ONLY JSON: {"key","summary","description","acceptanceCriteria":[],` +
    `"issueType":"story|bug|task|epic","status"}. If you cannot reach Jira, return {"error":"unavailable"}.`;
  const out = runClaude(prompt, {
    cwd: projectRoot,
    allowedTools: [
      "mcp__claude_ai_Atlassian__getJiraIssue",
      "mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql",
    ],
    mcpConfigPath: path.join(projectRoot, ".mcp.json"),
    timeoutMs: 60_000,
  });
  const parsed = parseTicketJson(out);
  if (!parsed || parsed.error || !parsed.summary) return null;
  return {
    key: typeof parsed.key === "string" ? parsed.key : ticketId,
    summary: String(parsed.summary),
    description: typeof parsed.description === "string" ? parsed.description : "",
    acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria) ? parsed.acceptanceCriteria.map(String) : [],
    issueType: ["story", "bug", "task", "epic"].includes(parsed.issueType) ? parsed.issueType : "story",
    status: typeof parsed.status === "string" ? parsed.status : "",
    assignee: null,
    sprint: null,
    epic: null,
  };
}

function parseTicketJson(out: string | null): Record<string, any> | null {
  if (!out) return null;
  // Narrow to a ```-fenced block when present, located with plain indexOf so there is no regex
  // backtracking for SonarCloud S8786. Falls back to the whole output; the brace scan below
  // extracts the JSON object either way.
  const text = extractFenceBody(out);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, any>;
  } catch {
    return null;
  }
}

// Return the body of the first ```-fenced block (skipping the fence's optional language tag line),
// or the whole input when there is no closing fence. Plain indexOf — no regex, no backtracking.
function extractFenceBody(out: string): string {
  const open = out.indexOf("```");
  if (open < 0) return out;
  const lineEnd = out.indexOf("\n", open);
  const bodyStart = lineEnd < 0 ? open + 3 : lineEnd + 1;
  const close = out.indexOf("```", bodyStart);
  return close < 0 ? out : out.slice(bodyStart, close);
}

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
