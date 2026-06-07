// Types for agent-smith — shared across all modules

// ----- Project Analysis -----

export interface DetectedProject {
  rootPath: string;
  backend: BackendInfo | null;
  frontend: FrontendInfo | null;
  testing: TestingInfo;
  linting: LintingInfo;
  cicd: CICDInfo | null;
  monorepo: MonorepoInfo | null;
  database: DatabaseInfo | null;
}

export interface BackendInfo {
  framework: BackendFramework;
  language: "python" | "typescript" | "javascript" | "ruby" | "java" | "php" | "go" | "rust" | "csharp" | "kotlin" | "swift" | "scala";
  languageVersion: string;
  hasHexagonalArch: boolean;
  hasServiceRepo: boolean;
  usesAPIView: boolean;
  usesFunctionViews: boolean;
  importStyle: "absolute" | "relative" | "mixed";
  rolePattern: "decorators" | "middleware" | "manual" | "none";
  authMethod: string;
  loggingPattern: "structured" | "unstructured";
  orm: string | null;
}

export type BackendFramework =
  // Python
  | "django" | "fastapi" | "flask" | "pyramid"
  // TypeScript/JavaScript
  | "express" | "fastify" | "nestjs" | "koa" | "hono"
  | "nextjs-api" | "nuxt-api" | "remix" | "sveltekit-api"
  | "adonisjs" | "feathersjs"
  // Ruby
  | "rails" | "sinatra"
  // PHP
  | "laravel" | "symfony" | "slim"
  // Java / JVM
  | "spring-boot" | "quarkus" | "micronaut" | "jakarta-ee"
  // Kotlin
  | "ktor" | "spring-boot-kotlin"
  // Go
  | "gin" | "echo" | "fiber" | "chi"
  // Rust
  | "actix-web" | "axum" | "rocket"
  // C#
  | "aspnet-core" | "blazor-api"
  // Swift
  | "vapor"
  // Scala
  | "play-framework"
  // Generic
  | "generic-server" | "unknown";

export interface FrontendInfo {
  framework: FrontendFramework;
  componentPattern: "script-setup" | "options-api" | "class-component" | "functional" | "unknown";
  uiLibrary: string | null;
  stateManagement: string | null;
  usesI18n: boolean;
  i18nLibrary: string | null;
  usesTypeScript: boolean;
  roleAwareUI: boolean;
}

export type FrontendFramework =
  // Vue ecosystem
  | "vue3" | "nuxt3"
  // React ecosystem
  | "react" | "nextjs" | "gatsby" | "remix-spa" | "react-native"
  // Angular
  | "angular"
  // Svelte
  | "svelte" | "sveltekit"
  // Solid
  | "solidjs"
  // Qwik
  | "qwik"
  // Astro
  | "astro"
  // Traditional / multi-page
  | "blazor-wasm" | "htmx" | "alpine"
  // Mobile
  | "flutter" | "swiftui"
  // Generic
  | "generic-spa" | "unknown";

export interface TestingInfo {
  backend: { framework: string; command: string } | null;
  frontend: { framework: string; command: string } | null;
}

export interface LintingInfo {
  backend: { tool: string; command: string } | null;
  frontend: { tool: string; command: string } | null;
}

export interface CICDInfo {
  provider: "github-actions" | "gitlab-ci" | "circleci" | "jenkins" | "unknown";
  configPath: string;
}

export interface MonorepoInfo {
  tool: "nx" | "turborepo" | "lerna" | "yarn-workspaces" | "pnpm-workspaces";
  packages: string[];
}

export interface DatabaseInfo {
  engine: "postgresql" | "mysql" | "sqlite" | "mongodb" | "mssql" | "unknown";
  orm: string | null;
}

// ----- MCP Server -----

export interface MCPServerDefinition {
  name: string;
  description: string;
  category: "code-intelligence" | "browser" | "documentation" | "quality" | "memory" | "pm" | "design";
  scope: "project" | "user" | "both";
  installType: "npm" | "npx" | "pipx" | "python" | "manual";
  installCommand: string;
  checkCommand: string;
  requiredEnvVars: string[];
  configTemplate: MCPConfigEntry;
}

export interface MCPConfigEntry {
  type?: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
}

// ----- Template Variables -----

export interface TemplateVariables {
  // Backend
  BACKEND_LANG: string;
  BACKEND_FRAMEWORK: string;
  BACKEND_FRAMEWORK_DETAIL: string;
  BACKEND_TEST_CMD: string;
  BACKEND_LINT_CMD: string;
  BACKEND_TYPE_CHECK_CMD: string;
  BACKEND_FORMAT_CMD: string;
  BACKEND_DIR: string;
  BACKEND_SETTINGS_MODULE: string;
  BACKEND_MIGRATE_CMD: string;

  // Frontend
  FRONTEND_FRAMEWORK: string;
  FRONTEND_UI_LIBRARY: string;
  FRONTEND_TEST_CMD: string;
  FRONTEND_LINT_CMD: string;
  FRONTEND_TYPE_CHECK_CMD: string;
  FRONTEND_DIR: string;
  FRONTEND_DEV_SERVER_CMD: string;

  // Architecture
  ROLE_SYSTEM: string;
  ROLE_VALID_VALUES: string;
  AUTH_METHOD: string;
  IMPORT_STYLE: string;
  DB_ENGINE: string;
  ORM: string;
  PRE_PUSH_GATES: string;
  API_DOCS_LIBRARY: string;

  // Project
  PROJECT_NAME: string;
  REPO_NAME: string;
  GIT_HOST: string;

  // Observability
  LOGGING_PATTERN: string;
  LOGGING_CANONICAL_KEYS: string;
}

// ----- Pipeline -----

export type PipelinePhase =
  | "plan"
  | "implement"
  | "test"
  | "review"
  | "docs"
  | "pr";

export type ApprovalGate = "none" | "plan" | "all";

export interface PipelineContext {
  ticketId: string | null;
  ticketTitle: string | null;
  ticketDescription: string | null;
  acceptanceCriteria: string[];
  branch: string;
  approvalGate: ApprovalGate;
  phasesCompleted: PipelinePhase[];
  phaseResults: Map<PipelinePhase, PhaseResult>;
}

export interface PhaseResult {
  phase: PipelinePhase;
  success: boolean;
  summary: string;
  filesChanged: string[];
  errors: string[];
  warnings: string[];
}

// ----- Jira -----

export interface JiraTicket {
  key: string;
  summary: string;
  description: string;
  acceptanceCriteria: string[];
  issueType: "story" | "bug" | "task" | "epic";
  status: string;
  assignee: string | null;
  sprint: string | null;
  epic: string | null;
}

export interface DecomposedTask {
  key: string;
  summary: string;
  description: string;
  technicalScope: {
    backendFiles: string[];
    frontendFiles: string[];
    newEndpoints: string[];
    newComponents: string[];
    databaseChanges: boolean;
  };
  estimatedComplexity: "low" | "medium" | "high";
  dependencies: string[];
}

// ----- Platform Adapter -----

export interface PlatformAdapter {
  name: string;
  displayName: string;
  mcpConfigPath: string;
  mcpConfigFormat: "claude-settings" | "cursor-mcp" | "continue-config" | "smithery";
  skillsBasePath: string;
  commandsBasePath: string;
  architectureBasePath: string;
  installMCPs(configs: MCPConfigBundle): Promise<void>;
  scaffoldSkills(skills: SkillFile[]): Promise<void>;
}

export interface MCPConfigBundle {
  projectSettings: Record<string, MCPConfigEntry>;
  projectMcp: Record<string, MCPConfigEntry>;
  userMcp: Record<string, MCPConfigEntry>;
}

export interface SkillFile {
  relativePath: string;
  content: string;
}

// ----- Health Check -----

export interface HealthReport {
  platform: string;
  nodeVersion: string;
  npmVersion: string;
  gitVersion: string;
  checks: HealthCheck[];
  overallStatus: "healthy" | "degraded" | "unhealthy";
}

export interface HealthCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  suggestion?: string;
}
