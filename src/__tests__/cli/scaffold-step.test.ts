/**
 * Unit tests for src/cli/init-steps/scaffold-step.ts
 *
 * All I/O dependencies mocked. Tests assert orchestration: correct functions called,
 * dry-run path skips installSentrux and caveman writes, all scaffold steps wired up.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../../scaffold/commands.js", () => ({
  scaffoldCommands: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../scaffold/skills.js", () => ({
  scaffoldSkills: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../scaffold/configs.js", () => ({
  scaffoldConfigs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../scaffold/hooks.js", () => ({
  scaffoldHooks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../scaffold/permissions.js", () => ({
  scaffoldPermissions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../scaffold/ci-workflow.js", () => ({
  scaffoldCI: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../adapt/skill-customizer.js", () => ({
  customizeSkills: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../adapt/architecture-writer.js", () => ({
  writeArchitectureDocs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../install/sentrux-installer.js", () => ({
  installSentrux: vi.fn().mockResolvedValue({ installed: true, configPath: "/tmp/.sentrux", skipped: false }),
}));

vi.mock("../../adapt/caveman-compress.js", () => ({
  cavemanCompress: vi.fn().mockImplementation((content: string) => `compressed:${content}`),
}));

vi.mock("../../analyze/source-dir.js", () => ({
  resolveSourceDirs: vi.fn().mockResolvedValue(["src"]),
}));

vi.mock("../../scaffold/source-config.js", () => ({
  writeSourceConfig: vi.fn().mockResolvedValue(undefined),
}));

// fs-extra: the source uses `import fs from "fs-extra"` (default import).
// vi.mock is hoisted, so we cannot reference module-level consts here;
// we grab the mocks from the module after importing.
vi.mock("fs-extra", async () => {
  const actual = await vi.importActual<typeof import("fs-extra")>("fs-extra");
  const actualDefault = (actual as Record<string, unknown>)["default"] as Record<string, unknown> | undefined;
  const existsSyncMock = vi.fn().mockReturnValue(false);
  const readdirSyncMock = vi.fn().mockReturnValue([]);
  const readFileMock = vi.fn().mockResolvedValue("content");
  const writeFileMock = vi.fn().mockResolvedValue(undefined);
  return {
    ...actual,
    existsSync: existsSyncMock,
    readdirSync: readdirSyncMock,
    readFile: readFileMock,
    writeFile: writeFileMock,
    default: {
      ...(actualDefault ?? {}),
      existsSync: existsSyncMock,
      readdirSync: readdirSyncMock,
      readFile: readFileMock,
      writeFile: writeFileMock,
    },
  };
});

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

import fsExtra from "fs-extra";
import { runScaffoldStep } from "../../cli/init-steps/scaffold-step.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";
import { scaffoldCommands } from "../../scaffold/commands.js";
import { scaffoldSkills } from "../../scaffold/skills.js";
import { scaffoldConfigs } from "../../scaffold/configs.js";
import { scaffoldHooks } from "../../scaffold/hooks.js";
import { scaffoldPermissions } from "../../scaffold/permissions.js";
import { scaffoldCI } from "../../scaffold/ci-workflow.js";
import { customizeSkills } from "../../adapt/skill-customizer.js";
import { writeArchitectureDocs } from "../../adapt/architecture-writer.js";
import { installSentrux } from "../../install/sentrux-installer.js";
import { cavemanCompress } from "../../adapt/caveman-compress.js";
import { resolveSourceDirs } from "../../analyze/source-dir.js";
import { writeSourceConfig } from "../../scaffold/source-config.js";

const mockScaffoldCommands = vi.mocked(scaffoldCommands);
const mockScaffoldSkills = vi.mocked(scaffoldSkills);
const mockScaffoldConfigs = vi.mocked(scaffoldConfigs);
const mockScaffoldHooks = vi.mocked(scaffoldHooks);
const mockScaffoldPermissions = vi.mocked(scaffoldPermissions);
const mockScaffoldCI = vi.mocked(scaffoldCI);
const mockCustomizeSkills = vi.mocked(customizeSkills);
const mockWriteArchitectureDocs = vi.mocked(writeArchitectureDocs);
const mockInstallSentrux = vi.mocked(installSentrux);
const mockCavemanCompress = vi.mocked(cavemanCompress);
const mockResolveSourceDirs = vi.mocked(resolveSourceDirs);
const mockWriteSourceConfig = vi.mocked(writeSourceConfig);

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

const MOCK_VARS = { ...DEFAULT_TEMPLATE_VARS, PROJECT_NAME: "test", BACKEND_LANG: "TypeScript" };

const BASE_OPTS = {
  targetDir: "/tmp/test-scaffold",
  templateVars: MOCK_VARS,
  project: MOCK_PROJECT,
  platform: "claude-code",
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("runScaffoldStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSourceDirs.mockResolvedValue(["src"]);
    mockScaffoldCI.mockResolvedValue(true);
    mockInstallSentrux.mockResolvedValue({ installed: true, configPath: "/tmp/.sentrux", skipped: false, reason: undefined });
  });

  it("calls all scaffold functions in a non-dry-run", async () => {
    await runScaffoldStep({ ...BASE_OPTS, dryRun: false });

    expect(mockScaffoldCommands).toHaveBeenCalledOnce();
    expect(mockScaffoldSkills).toHaveBeenCalledOnce();
    expect(mockCustomizeSkills).toHaveBeenCalledOnce();
    expect(mockWriteArchitectureDocs).toHaveBeenCalledOnce();
    expect(mockInstallSentrux).toHaveBeenCalledOnce();
    expect(mockScaffoldConfigs).toHaveBeenCalledOnce();
    expect(mockResolveSourceDirs).toHaveBeenCalledOnce();
    expect(mockWriteSourceConfig).toHaveBeenCalledOnce();
    expect(mockScaffoldHooks).toHaveBeenCalledOnce();
    expect(mockScaffoldPermissions).toHaveBeenCalledOnce();
    expect(mockScaffoldCI).toHaveBeenCalledOnce();
  });

  it("passes dryRun=true to all scaffold functions", async () => {
    await runScaffoldStep({ ...BASE_OPTS, dryRun: true });

    expect(mockScaffoldCommands).toHaveBeenCalledWith(BASE_OPTS.targetDir, MOCK_VARS, true);
    expect(mockScaffoldSkills).toHaveBeenCalledWith(BASE_OPTS.targetDir, MOCK_VARS, true);
    expect(mockScaffoldConfigs).toHaveBeenCalledWith(BASE_OPTS.targetDir, BASE_OPTS.platform, true);
    expect(mockScaffoldHooks).toHaveBeenCalledWith(BASE_OPTS.targetDir, true);
    expect(mockScaffoldCI).toHaveBeenCalledWith(BASE_OPTS.targetDir, MOCK_VARS, true);
  });

  it("skips installSentrux in dry-run mode", async () => {
    await runScaffoldStep({ ...BASE_OPTS, dryRun: true });

    expect(mockInstallSentrux).not.toHaveBeenCalled();
  });

  it("calls installSentrux in non-dry-run mode", async () => {
    await runScaffoldStep({ ...BASE_OPTS, dryRun: false });

    expect(mockInstallSentrux).toHaveBeenCalledWith(BASE_OPTS.targetDir, MOCK_VARS);
  });

  it("logs info when installSentrux reports existing config", async () => {
    mockInstallSentrux.mockResolvedValue({ installed: false, configPath: null, skipped: true, reason: "existing config found" });

    // Should not throw
    await expect(runScaffoldStep({ ...BASE_OPTS, dryRun: false })).resolves.toBeUndefined();
  });

  it("skips caveman compression when caveman=false", async () => {
    await runScaffoldStep({ ...BASE_OPTS, dryRun: false, caveman: false });

    expect(mockCavemanCompress).not.toHaveBeenCalled();
  });

  it("skips caveman compression when dryRun=true even with caveman=true", async () => {
    await runScaffoldStep({ ...BASE_OPTS, dryRun: true, caveman: true });

    expect(mockCavemanCompress).not.toHaveBeenCalled();
  });

  it("passes project to scaffoldPermissions", async () => {
    await runScaffoldStep({ ...BASE_OPTS, dryRun: false });

    expect(mockScaffoldPermissions).toHaveBeenCalledWith(
      BASE_OPTS.targetDir,
      MOCK_PROJECT,
      false,
    );
  });

  it("passes templateVars to writeArchitectureDocs", async () => {
    await runScaffoldStep({ ...BASE_OPTS, dryRun: false });

    expect(mockWriteArchitectureDocs).toHaveBeenCalledWith(
      BASE_OPTS.targetDir,
      MOCK_VARS,
      false,
      expect.objectContaining({ project: MOCK_PROJECT }),
    );
  });

  it("calls writeSourceConfig with resolved source dirs", async () => {
    mockResolveSourceDirs.mockResolvedValue(["src", "lib"]);

    await runScaffoldStep({ ...BASE_OPTS, dryRun: false, auto: true });

    expect(mockWriteSourceConfig).toHaveBeenCalledWith(BASE_OPTS.targetDir, ["src", "lib"], false);
  });

  it("resolveSourceDirs called with non-interactive=true when auto=true", async () => {
    await runScaffoldStep({ ...BASE_OPTS, dryRun: false, auto: true });

    expect(mockResolveSourceDirs).toHaveBeenCalledWith(
      BASE_OPTS.targetDir,
      MOCK_PROJECT,
      { interactive: false },
    );
  });

  it("resolveSourceDirs called with non-interactive=true when noInterview=true", async () => {
    await runScaffoldStep({ ...BASE_OPTS, dryRun: false, noInterview: true });

    expect(mockResolveSourceDirs).toHaveBeenCalledWith(
      BASE_OPTS.targetDir,
      MOCK_PROJECT,
      { interactive: false },
    );
  });

  it("resolveSourceDirs non-interactive when dryRun=true", async () => {
    await runScaffoldStep({ ...BASE_OPTS, dryRun: true });

    expect(mockResolveSourceDirs).toHaveBeenCalledWith(
      BASE_OPTS.targetDir,
      MOCK_PROJECT,
      { interactive: false },
    );
  });

  it("passes useLlm=false when llm=false to writeArchitectureDocs", async () => {
    await runScaffoldStep({ ...BASE_OPTS, dryRun: false, llm: false });

    expect(mockWriteArchitectureDocs).toHaveBeenCalledWith(
      BASE_OPTS.targetDir,
      MOCK_VARS,
      false,
      expect.objectContaining({ useLlm: false }),
    );
  });

  it("passes useLlm=true when llm is not false", async () => {
    await runScaffoldStep({ ...BASE_OPTS, dryRun: false, llm: true });

    expect(mockWriteArchitectureDocs).toHaveBeenCalledWith(
      BASE_OPTS.targetDir,
      MOCK_VARS,
      false,
      expect.objectContaining({ useLlm: true }),
    );
  });

  it("applies caveman compression to markdown files in skills/arch dirs when enabled and not dryRun", async () => {
    // Simulate: skillDir exists, has one .md file; archDir doesn't exist
    const mockFs = vi.mocked(fsExtra);
    vi.mocked(mockFs.existsSync).mockImplementation((p: unknown) => String(p).includes("skills"));
    vi.mocked(mockFs.readdirSync).mockReturnValue([
      Object.assign(Object.create({}), {
        name: "SKILL.md",
        isDirectory: () => false,
      }),
    ] as never);
    vi.mocked(mockFs.readFile).mockResolvedValue("original content" as never);
    mockCavemanCompress.mockReturnValue("compressed content");

    await runScaffoldStep({ ...BASE_OPTS, dryRun: false, caveman: true });

    expect(mockCavemanCompress).toHaveBeenCalledWith("original content");
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("SKILL.md"),
      "compressed content",
      "utf-8",
    );
  });

  it("recursively walks subdirectories during caveman compression", async () => {
    // Simulate: skillDir exists with a subdirectory that contains a .md file
    const mockFs = vi.mocked(fsExtra);
    vi.mocked(mockFs.existsSync).mockImplementation((p: unknown) => String(p).includes("skills"));
    vi.mocked(mockFs.readdirSync).mockImplementation((p: unknown) => {
      const pathStr = String(p);
      if (pathStr.includes("subdir")) {
        return [
          Object.assign(Object.create({}), { name: "NESTED.md", isDirectory: () => false }),
        ] as never;
      }
      // root skillDir: one subdir, one .md
      return [
        Object.assign(Object.create({}), { name: "subdir", isDirectory: () => true }),
        Object.assign(Object.create({}), { name: "ROOT.md", isDirectory: () => false }),
      ] as never;
    });
    vi.mocked(mockFs.readFile).mockResolvedValue("content" as never);
    mockCavemanCompress.mockReturnValue("compressed");

    await runScaffoldStep({ ...BASE_OPTS, dryRun: false, caveman: true });

    // cavemanCompress should be called for both .md files (root + nested)
    expect(mockCavemanCompress).toHaveBeenCalledTimes(2);
  });

  it("invokes onProgress callback passed to writeArchitectureDocs", async () => {
    // Arrange: make writeArchitectureDocs call the onProgress callback it receives
    mockWriteArchitectureDocs.mockImplementation(async (_dir, _vars, _dry, opts) => {
      if (opts?.onProgress) opts.onProgress("Analyzing architecture...");
    });

    await runScaffoldStep({ ...BASE_OPTS, dryRun: false });

    // The callback was exercised; writeArchitectureDocs was called with an onProgress fn
    expect(mockWriteArchitectureDocs).toHaveBeenCalledWith(
      BASE_OPTS.targetDir,
      MOCK_VARS,
      false,
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
  });
});
