/**
 * Unit tests for src/cli/init-steps/install-step.ts
 *
 * Asserts orchestration: consent gate works, MCP config called, Obsidian vault
 * created, local MCPs registered, CLAUDE.md written. dry-run skips install + vault.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../../install/mcp-installer.js", () => ({
  configureMCPs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../install/mcp-indexer.js", () => ({
  runMcpIndexing: vi.fn().mockResolvedValue({ indexed: [], skipped: [], failed: [] }),
}));

vi.mock("../../install/install-flow.js", () => ({
  installWithConsent: vi.fn().mockResolvedValue({ consent: { approved: true } }),
}));

vi.mock("../../install/obsidian-vault.js", () => ({
  setupObsidianVault: vi.fn().mockResolvedValue({ vaultPath: null, created: false }),
}));

vi.mock("../../adapt/claude-md-writer.js", () => ({
  writeClaudeMd: vi.fn().mockReturnValue({ created: true, path: "/tmp/test/CLAUDE.md" }),
}));

vi.mock("ora", () => {
  const spinner = {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: "",
  };
  return { default: vi.fn(() => spinner) };
});

// ── Imports ────────────────────────────────────────────────────────────────

import { runInstallStep } from "../../cli/init-steps/install-step.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";
import { configureMCPs } from "../../install/mcp-installer.js";
import { installWithConsent } from "../../install/install-flow.js";
import { setupObsidianVault } from "../../install/obsidian-vault.js";
import { writeClaudeMd } from "../../adapt/claude-md-writer.js";

const mockConfigureMCPs = vi.mocked(configureMCPs);
const mockInstallWithConsent = vi.mocked(installWithConsent);
const mockSetupObsidianVault = vi.mocked(setupObsidianVault);
const mockWriteClaudeMd = vi.mocked(writeClaudeMd);

// ── Fixtures ───────────────────────────────────────────────────────────────

const MOCK_PROJECT = {
  rootPath: "/tmp/test",
  projectType: "cli-tool" as const,
  backend: null,
  frontend: null,
  testing: { backend: null, frontend: null },
  linting: { backend: null, frontend: null },
  cicd: null,
  monorepo: null,
  database: null,
};

const MOCK_VARS = { ...DEFAULT_TEMPLATE_VARS, PROJECT_NAME: "test" };

const BASE_OPTS = {
  targetDir: "/tmp/test-install",
  templateVars: MOCK_VARS,
  project: MOCK_PROJECT,
  platform: "claude-code",
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("runInstallStep", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips installWithConsent in dry-run mode", async () => {
    await runInstallStep({ ...BASE_OPTS, dryRun: true });

    expect(mockInstallWithConsent).not.toHaveBeenCalled();
  });

  it("calls installWithConsent in non-dry-run mode", async () => {
    await runInstallStep({ ...BASE_OPTS, dryRun: false });

    expect(mockInstallWithConsent).toHaveBeenCalledOnce();
  });

  it("always calls configureMCPs", async () => {
    await runInstallStep({ ...BASE_OPTS, dryRun: true });
    expect(mockConfigureMCPs).toHaveBeenCalledOnce();

    vi.clearAllMocks();

    await runInstallStep({ ...BASE_OPTS, dryRun: false });
    expect(mockConfigureMCPs).toHaveBeenCalledOnce();
  });

  it("always writes CLAUDE.md", async () => {
    await runInstallStep({ ...BASE_OPTS, dryRun: true });
    expect(mockWriteClaudeMd).toHaveBeenCalledWith(BASE_OPTS.targetDir, true);

    vi.clearAllMocks();

    await runInstallStep({ ...BASE_OPTS, dryRun: false });
    expect(mockWriteClaudeMd).toHaveBeenCalledWith(BASE_OPTS.targetDir, false);
  });

  it("skips setupObsidianVault in dry-run mode", async () => {
    await runInstallStep({ ...BASE_OPTS, dryRun: true });
    expect(mockSetupObsidianVault).not.toHaveBeenCalled();
  });

  it("skips setupObsidianVault when platform is not claude-code", async () => {
    await runInstallStep({ ...BASE_OPTS, dryRun: false, platform: "vscode" });
    expect(mockSetupObsidianVault).not.toHaveBeenCalled();
  });

  it("calls setupObsidianVault when not dryRun and platform=claude-code", async () => {
    await runInstallStep({ ...BASE_OPTS, dryRun: false });
    expect(mockSetupObsidianVault).toHaveBeenCalledOnce();
  });

  it("configures all MCP scopes through configureMCPs (.mcp.json) — no `claude mcp add --scope local`", async () => {
    // All scopes (project/user/local) are written into .mcp.json by configureMCPs.
    // The orchestration never shells out to `claude mcp add --scope local`.
    await runInstallStep({ ...BASE_OPTS, dryRun: false });
    // configureMCPs is still called (it now handles all scopes)
    expect(mockConfigureMCPs).toHaveBeenCalledOnce();
    // setupObsidianVault still runs (vault creation, not MCP registration)
    expect(mockSetupObsidianVault).toHaveBeenCalledOnce();
  });

  it("logs consent declined message when consent not approved", async () => {
    mockInstallWithConsent.mockResolvedValue({ consent: { approved: false, reason: "skipped via --no-install" }, summary: null });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runInstallStep({ ...BASE_OPTS, dryRun: false });

    const calls = logSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => s.includes("Skipping MCP install"))).toBe(true);
    logSpy.mockRestore();
  });

  it("logs vault created path when vault is created", async () => {
    mockSetupObsidianVault.mockResolvedValue({ vaultPath: "/tmp/vault", created: true });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runInstallStep({ ...BASE_OPTS, dryRun: false });

    const calls = logSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => s.includes("/tmp/vault"))).toBe(true);
    logSpy.mockRestore();
  });

  it("does not log vault path when vault already existed (created=false)", async () => {
    mockSetupObsidianVault.mockResolvedValue({ vaultPath: "/existing/vault", created: false });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runInstallStep({ ...BASE_OPTS, dryRun: false });

    const calls = logSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => s.includes("/existing/vault"))).toBe(false);
    logSpy.mockRestore();
  });

  it("passes yes and auto opts to installWithConsent", async () => {
    await runInstallStep({ ...BASE_OPTS, dryRun: false, yes: true, auto: true });

    expect(mockInstallWithConsent).toHaveBeenCalledWith(
      { project: MOCK_PROJECT },
      { yes: true, noInstall: false, auto: true },
    );
  });

  it("passes noInstall=true when install=false", async () => {
    await runInstallStep({ ...BASE_OPTS, dryRun: false, install: false });

    expect(mockInstallWithConsent).toHaveBeenCalledWith(
      { project: MOCK_PROJECT },
      expect.objectContaining({ noInstall: true }),
    );
  });

  it("setupObsidianVault called with interactive=false when auto=true", async () => {
    await runInstallStep({ ...BASE_OPTS, dryRun: false, auto: true });

    expect(mockSetupObsidianVault).toHaveBeenCalledWith(
      BASE_OPTS.targetDir,
      { interactive: false },
    );
  });

  it("setupObsidianVault called with interactive=false when noInterview=true", async () => {
    await runInstallStep({ ...BASE_OPTS, dryRun: false, noInterview: true });

    expect(mockSetupObsidianVault).toHaveBeenCalledWith(
      BASE_OPTS.targetDir,
      { interactive: false },
    );
  });
});
