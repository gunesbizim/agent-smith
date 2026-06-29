import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all heavy dependencies so initCommand runs fast and hermetically
vi.mock("../../analyze/project-detector.js", () => ({
  detectProject: vi.fn().mockResolvedValue({
    rootPath: "/tmp/test-init",
    projectType: "cli-tool",
    backend: null,
    frontend: null,
    testing: { backend: null, frontend: null },
    linting: { backend: null, frontend: null },
    cicd: null,
    monorepo: null,
    database: null,
  }),
}));

vi.mock("../../analyze/architecture-sniffer.js", () => ({
  sniffArchitecture: vi.fn().mockResolvedValue([]),
  probeSentrux: vi.fn(),
}));

vi.mock("../../analyze/package-scanner.js", () => ({
  scanPackages: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../adapt/stack-customizer.js", () => ({
  mapBestPractices: vi.fn().mockReturnValue({
    BACKEND_LANG: "TypeScript", BACKEND_FRAMEWORK: "", BACKEND_FRAMEWORK_DETAIL: "",
    BACKEND_TEST_CMD: "", BACKEND_LINT_CMD: "", BACKEND_TYPE_CHECK_CMD: "",
    BACKEND_FORMAT_CMD: "", BACKEND_DIR: "src", BACKEND_SETTINGS_MODULE: "",
    BACKEND_MIGRATE_CMD: "", FRONTEND_FRAMEWORK: "none", FRONTEND_UI_LIBRARY: "none",
    FRONTEND_TEST_CMD: "", FRONTEND_LINT_CMD: "", FRONTEND_TYPE_CHECK_CMD: "",
    FRONTEND_DIR: "", FRONTEND_DEV_SERVER_CMD: "", ROLE_SYSTEM: "none",
    ROLE_VALID_VALUES: "", AUTH_METHOD: "none", IMPORT_STYLE: "absolute",
    DB_ENGINE: "none", ORM: "none", PRE_PUSH_GATES: "none", API_DOCS_LIBRARY: "none",
    SENTRUX_MAX_CYCLES: "", SENTRUX_MAX_CC: "25", SENTRUX_MAX_COUPLING: "C",
    SENTRUX_LAYERS: "", SENTRUX_BOUNDARIES: "", PROJECT_NAME: "test",
    REPO_NAME: "test", GIT_HOST: "github.com", LOGGING_PATTERN: "unstructured",
    LOGGING_CANONICAL_KEYS: "", ORM_PACKAGE: "none", ORM_PACKAGE_VERSION: "",
    AUTH_PACKAGE: "none", AUTH_PACKAGE_VERSION: "", VALIDATION_PACKAGE: "none",
    VALIDATION_PACKAGE_VERSION: "", LOGGING_PACKAGE: "none", LOGGING_PACKAGE_VERSION: "",
    DB_DRIVER_PACKAGE: "none", DB_DRIVER_PACKAGE_VERSION: "", CACHE_PACKAGE: "none",
    CACHE_PACKAGE_VERSION: "", UI_PACKAGE: "none", UI_PACKAGE_VERSION: "",
    STATE_PACKAGE: "none", STATE_PACKAGE_VERSION: "", FORM_PACKAGE: "none",
    FORM_PACKAGE_VERSION: "", ROUTER_PACKAGE: "none", ROUTER_PACKAGE_VERSION: "",
    RENDER_PACKAGE: "none", RENDER_PACKAGE_VERSION: "", TEST_FRAMEWORK_PACKAGE: "none",
    TEST_FRAMEWORK_PACKAGE_VERSION: "", E2E_PACKAGE: "none", E2E_PACKAGE_VERSION: "",
    MOCK_PACKAGE: "none", MOCK_PACKAGE_VERSION: "", TESTING_REQUIREMENTS: "unit tests",
    PR_CHECKLIST: "tests pass",
  }),
}));

vi.mock("../../install/dependency-checker.js", () => ({
  checkDependencies: vi.fn().mockResolvedValue({
    ok: true, nodeVersion: "22.0.0", npmVersion: "10.0.0", gitVersion: "2.40.0", missing: [],
  }),
}));

vi.mock("../../install/mcp-installer.js", () => ({
  installMCPs: vi.fn().mockResolvedValue({ installed: [], prewarmed: [], alreadyPresent: [], onDemand: [], manual: [], failed: [] }),
  configureMCPs: vi.fn().mockResolvedValue(undefined),
  selectServersToInstall: vi.fn().mockReturnValue([]),
}));

vi.mock("../../install/mcp-indexer.js", () => ({
  runMcpIndexing: vi.fn().mockResolvedValue({ indexed: [], skipped: [], failed: [] }),
}));

vi.mock("../../install/install-consent.js", () => ({
  resolveConsent: vi.fn().mockResolvedValue({ approved: true }),
}));

vi.mock("../../install/gh-installer.js", () => ({
  ensureGhCli: vi.fn().mockResolvedValue({ available: true, alreadyPresent: true, installed: false, skipped: false }),
}));

vi.mock("../../adapt/architecture-writer.js", () => ({
  writeArchitectureDocs: vi.fn().mockResolvedValue(undefined),
  writeSentruxRules: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../scaffold/commands.js", () => ({
  scaffoldCommands: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../scaffold/skills.js", () => ({
  scaffoldSkills: vi.fn().mockResolvedValue(undefined),
  customizeSkills: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../scaffold/configs.js", () => ({
  scaffoldConfigs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../scaffold/hooks.js", () => ({
  scaffoldHooks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../adapt/project-interview.js", () => ({
  runInterview: vi.fn().mockResolvedValue({
    branchNaming: "", commitFormat: "", ticketPrefix: "PROJ-",
    prChecklist: [], testingRequirements: [], architectureRules: [],
    securityRequirements: [], codeStyle: [], customNotes: "", allowCycles: "no", maxCC: "25",
  }),
  applyInterviewAnswers: vi.fn().mockImplementation((vars) => vars),
}));

import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { initCommand } from "../../cli/init.js";
import { probeSentrux } from "../../analyze/architecture-sniffer.js";
import { ensureGhCli } from "../../install/gh-installer.js";
import { resolveConsent } from "../../install/install-consent.js";
const mockProbeSentrux = vi.mocked(probeSentrux);
const mockGh = vi.mocked(ensureGhCli);
const mockConsent = vi.mocked(resolveConsent);

const PROBE_OK = { available: true, cycles: 0, maxCC: 12, couplingGrade: "A", qualitySignal: 90, bottleneck: null } as const;

describe("initCommand — sentrux probe integration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("handles probe available with zero cycles (enforce mode)", async () => {
    mockProbeSentrux.mockResolvedValue({
      available: true, cycles: 0, maxCC: 15, couplingGrade: "A", qualitySignal: 95, bottleneck: null,
    });
    await expect(initCommand({ auto: true, dryRun: true })).resolves.not.toThrow();
  });

  it("handles probe available with existing cycles (ratchet mode)", async () => {
    mockProbeSentrux.mockResolvedValue({
      available: true, cycles: 3, maxCC: 20, couplingGrade: "B", qualitySignal: 80, bottleneck: "src/core",
    });
    await expect(initCommand({ auto: true, dryRun: true })).resolves.not.toThrow();
  });

  it("handles probe available with null maxCC/couplingGrade", async () => {
    mockProbeSentrux.mockResolvedValue({
      available: true, cycles: 0, maxCC: null, couplingGrade: null, qualitySignal: null, bottleneck: null,
    });
    await expect(initCommand({ auto: true, dryRun: true })).resolves.not.toThrow();
  });

  it("handles probe not available (advisory mode)", async () => {
    mockProbeSentrux.mockResolvedValue({
      available: false, cycles: null, maxCC: null, couplingGrade: null, qualitySignal: null, bottleneck: null,
    });
    await expect(initCommand({ auto: true, dryRun: true })).resolves.not.toThrow();
  });

  it("non-dry run actually installs sentrux config and writes CLAUDE.md", async () => {
    mockProbeSentrux.mockResolvedValue({
      available: true, cycles: 0, maxCC: 12, couplingGrade: "A", qualitySignal: 90, bottleneck: null,
    });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-smith-init-"));
    fs.ensureDirSync(path.join(tmp, ".claude"));
    try {
      // llm:false skips the headless-claude refine + skill-generation paths.
      await expect(initCommand({ auto: true, dryRun: false, llm: false, dir: tmp })).resolves.not.toThrow();
      expect(fs.existsSync(path.join(tmp, ".sentrux", "rules.toml"))).toBe(true);
      expect(fs.existsSync(path.join(tmp, ".sentrux", "baseline.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmp, "CLAUDE.md"))).toBe(true);
      expect(fs.readFileSync(path.join(tmp, "CLAUDE.md"), "utf-8")).toContain("<!-- agent-smith:start -->");
    } finally {
      fs.removeSync(tmp);
    }
  });

  it("non-dry: gh just-installed + consent declined + obsidian vault created (local MCP now in .mcp.json)", async () => {
    mockProbeSentrux.mockResolvedValue(PROBE_OK);
    mockGh.mockResolvedValue({ available: true, alreadyPresent: false, installed: true, skipped: false });
    mockConsent.mockResolvedValue({ approved: false, reason: "skipped via --no-install" });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-smith-init-"));
    process.env.OBSIDIAN_VAULT_PATH = path.join(tmp, "vault");
    try {
      await expect(initCommand({ auto: true, dryRun: false, llm: false, dir: tmp, install: false })).resolves.not.toThrow();
      expect(fs.existsSync(path.join(tmp, "vault"))).toBe(true); // setupObsidianVault created it
    } finally {
      delete process.env.OBSIDIAN_VAULT_PATH;
      fs.removeSync(tmp);
    }
  });

  it("non-dry: warns when gh cannot be auto-installed", async () => {
    mockProbeSentrux.mockResolvedValue(PROBE_OK);
    mockGh.mockResolvedValue({ available: false, alreadyPresent: false, installed: false, skipped: true, reason: "install gh manually" });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-smith-init-"));
    try {
      await expect(initCommand({ auto: true, dryRun: false, llm: false, dir: tmp })).resolves.not.toThrow();
    } finally {
      fs.removeSync(tmp);
    }
  });
});
