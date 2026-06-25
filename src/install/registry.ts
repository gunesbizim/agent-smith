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
    requiresPackageManager: ["npm"],
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
    requiresPackageManager: ["npm"],
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
    requiresPackageManager: ["pipx", "python"],
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
    installType: "prewarm",
    // Warm the npx cache with a fast, non-server command. A bare `npx @playwright/mcp@latest`
    // launches the stdio server and hangs forever — the `--version` form exits cleanly.
    installCommand: "npx -y @playwright/mcp@latest --version",
    checkCommand: "npx @playwright/mcp@latest --version",
    requiredEnvVars: [],
    requiresPackageManager: ["npx"],
    configTemplate: {
      command: "npx",
      // --output-dir routes all screenshots/traces into a gitignored dir so captured
      // artifacts are never committed (see ensureGitignore in mcp-installer).
      args: ["-y", "@playwright/mcp@latest", "--viewport-size=1440,900", "--output-dir", ".playwright-mcp"],
      env: {},
    },
  },
  {
    name: "chrome-devtools",
    description: "Deep debugging on logged-in Chrome — console, network, performance, lighthouse",
    category: "browser",
    scope: "project",
    installType: "prewarm",
    installCommand: "npx -y chrome-devtools-mcp@latest --version",
    checkCommand: "npx chrome-devtools-mcp@latest --version",
    requiredEnvVars: [],
    requiresPackageManager: ["npx"],
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
    installType: "npm",
    installCommand: "npm install -g sonarqube-mcp-server",
    checkCommand: "npx sonarqube-mcp-server@latest --version",
    // Only vars without a template default are truly required; SONARQUBE_URL has a default.
    requiredEnvVars: ["SONARQUBE_TOKEN"],
    requiresPackageManager: ["npm"],
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
      // No inner quotes: %LOCALAPPDATA%\Microsoft\WindowsApps has no spaces, and that dir is on PATH
      // by default on Windows 10+, so dropping sentrux.exe there makes `sentrux` resolvable. Nested
      // cmd.exe→PowerShell quoting (the previous \"...\") is fragile, so it is avoided entirely.
      win32: String.raw`powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing -Uri https://github.com/sentrux/sentrux/releases/latest/download/sentrux-windows-x86_64.exe -OutFile $env:LOCALAPPDATA\Microsoft\WindowsApps\sentrux.exe"`,
    },
    checkCommand: "sentrux --version",
    requiredEnvVars: [],
    requiresPackageManager: ["brew"],
    configTemplate: {
      type: "stdio",
      command: "sentrux",
      args: ["mcp"],
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
    requiresPackageManager: ["npx"],
    configTemplate: {
      command: "npx",
      args: ["-y", "@vuetify/mcp"],
      env: {},
    },
  },

  // ---- Framework-aware (stack-gated) ----
  {
    name: "laravel-boost",
    description: "Laravel Boost — framework-aware MCP for the app: routes, models, DB schema, config, artisan, version-correct docs",
    category: "code-intelligence",
    // Project scope: the server is the app's own `php artisan boost:mcp`, so it is
    // per-repo. Only configured/installed when a Laravel backend is detected
    // (see isServerApplicable). Install is manual by design — agent-smith does not
    // run composer/artisan for you; install laravel/boost in the app first:
    //   composer require laravel/boost --dev && php artisan boost:install
    scope: "project",
    installType: "manual",
    installCommand: "",
    // Quick, non-starting presence check (boost:mcp itself is a long-running server).
    checkCommand: "composer show laravel/boost",
    requiredEnvVars: [],
    requiresPackageManager: ["composer", "php"],
    configTemplate: {
      type: "stdio",
      command: "php",
      args: ["artisan", "boost:mcp"],
      env: {},
    },
  },

  // ---- Documentation ----
  {
    name: "obsidian",
    description: "Read/write the Obsidian knowledge vault",
    category: "documentation",
    // local scope: per-repo, private to each developer (~/.claude.json), never committed.
    // Each repo points at its own vault path — supports multi-repo from one install.
    scope: "local",
    installType: "npx",
    installCommand: "",
    checkCommand: "npx mcp-obsidian --version",
    requiredEnvVars: ["OBSIDIAN_VAULT_PATH"],
    requiresPackageManager: ["npx"],
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
    requiresPackageManager: ["pipx", "python"],
    configTemplate: {
      type: "stdio",
      command: "python",
      args: ["-m", "mempalace.mcp_server"],
      env: {},
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
    // Only vars without a template default are truly required; JIRA_BASE_URL has a default.
    requiredEnvVars: ["JIRA_API_TOKEN"],
    requiresPackageManager: ["npx"],
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
