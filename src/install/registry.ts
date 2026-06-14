// MCP Registry — all known MCP servers with install methods
import type { MCPServerDefinition } from "../shared/types.js";

export const MCP_REGISTRY: MCPServerDefinition[] = [
  // ---- Code Intelligence ----
  {
    name: "gitnexus",
    description: "Code intelligence graph — impact analysis, execution flows, blast radius",
    category: "code-intelligence",
    scope: "project",
    installType: "npm",
    installCommand: "npm install -g gitnexus",
    checkCommand: "gitnexus",
    requiredEnvVars: [],
    configTemplate: {
      type: "stdio",
      command: "gitnexus",
      args: ["mcp"],
      env: {},
    },
  },
  {
    name: "git-memory",
    description: "Semantic search over git history — past decisions, bug fixes, file timelines",
    category: "code-intelligence",
    scope: "project",
    installType: "npm",
    installCommand: "npm install -g git-memory",
    checkCommand: "git-memory",
    requiredEnvVars: [],
    configTemplate: {
      type: "stdio",
      command: "git-memory",
      args: ["serve"],
      env: {},
    },
  },
  {
    name: "serena",
    description: "LSP-backed symbol navigation — find symbols, callers, diagnostics inline",
    category: "code-intelligence",
    scope: "project",
    installType: "pipx",
    installCommand: "pipx install serena",
    checkCommand: "serena",
    requiredEnvVars: [],
    configTemplate: {
      type: "stdio",
      command: "serena",
      args: ["start-mcp-server", "--project-from-cwd"],
      env: {},
    },
  },

  // ---- Browser Automation ----
  {
    name: "playwright",
    description: "Deterministic browser automation — navigate, snapshot, screenshot, fill",
    category: "browser",
    scope: "project",
    installType: "npx",
    installCommand: "npx @playwright/mcp@latest",
    checkCommand: "npx @playwright/mcp@latest --version",
    requiredEnvVars: [],
    configTemplate: {
      command: "npx",
      args: ["-y", "@playwright/mcp@latest", "--viewport-size=1440,900"],
      env: {},
    },
  },
  {
    name: "chrome-devtools",
    description: "Deep debugging on logged-in Chrome — console, network, performance, lighthouse",
    category: "browser",
    scope: "project",
    installType: "npx",
    installCommand: "npx chrome-devtools-mcp@latest",
    checkCommand: "npx chrome-devtools-mcp@latest --version",
    requiredEnvVars: [],
    configTemplate: {
      command: "npx",
      args: ["-y", "chrome-devtools-mcp@latest", "--browserUrl=http://127.0.0.1:9222"],
      env: {},
    },
  },

  // ---- Quality ----
  {
    name: "sonarqube",
    description: "Static analysis — issues, quality gates, hotspots, coverage metrics",
    category: "quality",
    scope: "user",
    installType: "npx",
    installCommand: "npm install -g sonarqube-mcp-server",
    checkCommand: "npx sonarqube-mcp-server@latest --version",
    requiredEnvVars: ["SONARQUBE_TOKEN", "SONARQUBE_URL"],
    configTemplate: {
      command: "npx",
      args: ["-y", "sonarqube-mcp-server@latest"],
      env: {
        SONARQUBE_TOKEN: "${SONARQUBE_TOKEN}",
        SONARQUBE_URL: "${SONARQUBE_URL:-https://sonarqube.example.com}",
      },
    },
  },

  {
    name: "sentrux",
    description: "Real-time architectural sensor — quality score (0-10000), layer/boundary rule enforcement, DSM, test-gap detection",
    category: "quality",
    scope: "project",
    installType: "shell",
    installCommand: {
      darwin: "brew install sentrux/tap/sentrux",
      linux: "curl -fsSL https://raw.githubusercontent.com/sentrux/sentrux/main/install.sh | sh",
      win32: String.raw`powershell -Command "Invoke-WebRequest https://github.com/sentrux/sentrux/releases/latest/download/sentrux-windows-x86_64.exe -OutFile \"$env:LOCALAPPDATA\Microsoft\WindowsApps\sentrux.exe\""`,
    },
    checkCommand: "sentrux --version",
    requiredEnvVars: [],
    configTemplate: {
      type: "stdio",
      command: "sentrux",
      args: ["--mcp"],
      env: {},
    },
  },

  // ---- Design ----
  {
    name: "vuetify",
    description: "Vuetify 3 component documentation — search props, slots, events",
    category: "design",
    scope: "user",
    installType: "npx",
    installCommand: "",
    checkCommand: "npx @vuetify/mcp --version",
    requiredEnvVars: [],
    configTemplate: {
      command: "npx",
      args: ["-y", "@vuetify/mcp"],
      env: {},
    },
  },

  // ---- Documentation ----
  {
    name: "obsidian",
    description: "Read/write the Obsidian knowledge vault",
    category: "documentation",
    scope: "user",
    installType: "npx",
    installCommand: "",
    checkCommand: "npx mcp-obsidian --version",
    requiredEnvVars: ["OBSIDIAN_VAULT_PATH"],
    configTemplate: {
      command: "npx",
      args: ["-y", "mcp-obsidian", "${OBSIDIAN_VAULT_PATH}"],
      env: {},
    },
  },

  // ---- Memory ----
  {
    name: "mempalace",
    description: "Persistent knowledge graph memory — drawers, tunnels, kg_add, kg_query",
    category: "memory",
    scope: "user",
    installType: "pipx",
    installCommand: "pipx install mempalace",
    checkCommand: "python -m mempalace.mcp_server --version",
    requiredEnvVars: [],
    configTemplate: {
      type: "stdio",
      command: "python",
      args: ["-m", "mempalace.mcp_server"],
      env: {},
    },
  },

  // ---- PM ----
  {
    name: "ouroboros",
    description: "PM agent framework — seed-based product interviews, AC generation, evolve/rewind",
    category: "pm",
    scope: "user",
    installType: "pipx",
    installCommand: "pipx install ouroboros",
    checkCommand: "ouroboros --version",
    requiredEnvVars: [],
    configTemplate: {
      type: "stdio",
      command: "ouroboros",
      args: ["mcp", "serve", "--transport", "stdio", "--runtime", "claude"],
      env: { CLAUDECODE: "1", CLAUDE_CODE_ENTRYPOINT: "cli" },
    },
  },

  // ---- Jira ----
  {
    name: "jira",
    description: "Jira + Confluence integration — create/edit issues, search JQL, epic tracking",
    category: "pm",
    scope: "user",
    installType: "npx",
    installCommand: "",
    checkCommand: "npx @anthropic/jira-mcp --version",
    requiredEnvVars: ["JIRA_API_TOKEN", "JIRA_BASE_URL"],
    configTemplate: {
      command: "npx",
      args: ["-y", "@anthropic/jira-mcp"],
      env: {
        JIRA_API_TOKEN: "${JIRA_API_TOKEN}",
        JIRA_BASE_URL: "${JIRA_BASE_URL:-https://your-domain.atlassian.net}",
      },
    },
  },
];

export function getMCPServer(name: string): MCPServerDefinition | undefined {
  return MCP_REGISTRY.find((s) => s.name === name);
}

export function getMCPByCategory(category: MCPServerDefinition["category"]): MCPServerDefinition[] {
  return MCP_REGISTRY.filter((s) => s.category === category);
}

export function getMCPByScope(scope: MCPServerDefinition["scope"]): MCPServerDefinition[] {
  return MCP_REGISTRY.filter((s) => s.scope === scope || s.scope === "both");
}
