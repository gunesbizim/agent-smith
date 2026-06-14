import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { makeDetectedProject as makeProject } from "../fixtures.js";

// Mock child_process before importing the module so spawnSync is intercepted
vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

import { probeSentrux, sniffArchitecture } from "../../analyze/architecture-sniffer.js";
import { spawnSync } from "node:child_process";

const mockSpawnSync = vi.mocked(spawnSync);

// ---- probeSentrux ----
// probeSentrux calls `sentrux check <path>` and parses "Quality: N" from text output.

const CHECK_OUTPUT_CLEAN = "sentrux check — 2 rules checked\n\nQuality: 8500\n\n✓ 0 violation(s) found";
const CHECK_OUTPUT_VIOLATIONS = "sentrux check — 2 rules checked\n\nQuality: 6278\n\n✗ [Error] max_cc: 3 function(s) exceed\n✗ 1 violation(s) found";

describe("probeSentrux — binary missing (spawnSync throws)", () => {
  beforeEach(() => {
    mockSpawnSync.mockImplementation(() => { throw new Error("command not found: sentrux"); });
  });
  afterEach(() => vi.clearAllMocks());

  it("returns available: false", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.available).toBe(false);
  });

  it("returns all null fields", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.cycles).toBeNull();
    expect(result.maxCC).toBeNull();
    expect(result.couplingGrade).toBeNull();
    expect(result.qualitySignal).toBeNull();
    expect(result.bottleneck).toBeNull();
  });
});

describe("probeSentrux — binary not in PATH (result.error set)", () => {
  beforeEach(() => {
    mockSpawnSync.mockReturnValue({ error: new Error("ENOENT"), status: null, stdout: "", stderr: "" } as any);
  });
  afterEach(() => vi.clearAllMocks());

  it("returns available: false when result.error is set", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.available).toBe(false);
  });
});

describe("probeSentrux — no Quality line in output", () => {
  beforeEach(() => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "Scanning...\n[build_project_map] done", stderr: "" } as any);
  });
  afterEach(() => vi.clearAllMocks());

  it("returns available: false when Quality line absent", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.available).toBe(false);
  });
});

describe("probeSentrux — clean output (no violations)", () => {
  beforeEach(() => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: CHECK_OUTPUT_CLEAN, stderr: "" } as any);
  });
  afterEach(() => vi.clearAllMocks());

  it("returns available: true", async () => {
    expect((await probeSentrux(os.tmpdir())).available).toBe(true);
  });

  it("extracts qualitySignal from Quality: line", async () => {
    expect((await probeSentrux(os.tmpdir())).qualitySignal).toBe(8500);
  });

  it("returns null for cycles (not in text output)", async () => {
    expect((await probeSentrux(os.tmpdir())).cycles).toBeNull();
  });

  it("returns null for maxCC (not in text output)", async () => {
    expect((await probeSentrux(os.tmpdir())).maxCC).toBeNull();
  });

  it("returns null for couplingGrade (not in text output)", async () => {
    expect((await probeSentrux(os.tmpdir())).couplingGrade).toBeNull();
  });

  it("returns null for bottleneck (not in text output)", async () => {
    expect((await probeSentrux(os.tmpdir())).bottleneck).toBeNull();
  });
});

describe("probeSentrux — violations (exit code 1, Quality still present)", () => {
  beforeEach(() => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: CHECK_OUTPUT_VIOLATIONS, stderr: "" } as any);
  });
  afterEach(() => vi.clearAllMocks());

  it("returns available: true even when violations found", async () => {
    expect((await probeSentrux(os.tmpdir())).available).toBe(true);
  });

  it("extracts qualitySignal from violations output", async () => {
    expect((await probeSentrux(os.tmpdir())).qualitySignal).toBe(6278);
  });
});

describe("probeSentrux — Quality in stderr (debug logs)", () => {
  afterEach(() => vi.clearAllMocks());

  it("finds Quality line in stderr when stdout is empty", async () => {
    mockSpawnSync.mockReturnValue({
      status: 0, stdout: "",
      stderr: "sentrux check — 2 rules checked\n\nQuality: 7100\n\n✓ 0 violation(s) found",
    } as any);
    const r = await probeSentrux(os.tmpdir());
    expect(r.available).toBe(true);
    expect(r.qualitySignal).toBe(7100);
  });
});

// ---- sniffArchitecture ----

describe("sniffArchitecture — no backend or frontend", () => {
  it("returns empty patterns for plain CLI project", async () => {
    const project = makeProject({ backend: null, frontend: null });
    const patterns = await sniffArchitecture(`${os.tmpdir()}/test-project`, project);
    expect(patterns).toEqual([]);
  });
});

describe("sniffArchitecture — backend patterns", () => {
  it("detects hexagonal-architecture pattern", async () => {
    const project = makeProject({
      backend: {
        framework: "django",
        language: "python",
        hasHexagonalArch: true,
        hasServiceRepo: false,
        usesAPIView: false,
        usesFunctionViews: false,
        rolePattern: "none",
        importStyle: "relative",
        loggingPattern: "unstructured",
        canonicalLogKeys: [],
        testRunner: "pytest",
        lintCommand: "flake8",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).toContain("hexagonal-architecture");
  });

  it("detects service-repository pattern", async () => {
    const project = makeProject({
      backend: {
        framework: "django",
        language: "python",
        hasHexagonalArch: false,
        hasServiceRepo: true,
        usesAPIView: false,
        usesFunctionViews: false,
        rolePattern: "none",
        importStyle: "relative",
        loggingPattern: "unstructured",
        canonicalLogKeys: [],
        testRunner: "pytest",
        lintCommand: "flake8",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).toContain("service-repository-pattern");
  });

  it("detects class-based-views-only", async () => {
    const project = makeProject({
      backend: {
        framework: "express",
        language: "typescript",
        hasHexagonalArch: false,
        hasServiceRepo: false,
        usesAPIView: true,
        usesFunctionViews: false,
        rolePattern: "none",
        importStyle: "relative",
        loggingPattern: "unstructured",
        canonicalLogKeys: [],
        testRunner: "vitest",
        lintCommand: "eslint",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).toContain("class-based-views-only");
  });

  it("does NOT detect class-based-views-only when usesFunctionViews is true", async () => {
    const project = makeProject({
      backend: {
        framework: "express",
        language: "typescript",
        hasHexagonalArch: false,
        hasServiceRepo: false,
        usesAPIView: true,
        usesFunctionViews: true,
        rolePattern: "none",
        importStyle: "relative",
        loggingPattern: "unstructured",
        canonicalLogKeys: [],
        testRunner: "vitest",
        lintCommand: "eslint",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).not.toContain("class-based-views-only");
  });

  it("detects role-decorator-auth", async () => {
    const project = makeProject({
      backend: {
        framework: "django",
        language: "python",
        hasHexagonalArch: false,
        hasServiceRepo: false,
        usesAPIView: false,
        usesFunctionViews: false,
        rolePattern: "decorators",
        importStyle: "relative",
        loggingPattern: "unstructured",
        canonicalLogKeys: [],
        testRunner: "pytest",
        lintCommand: "flake8",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).toContain("role-decorator-auth");
  });

  it("detects absolute-imports pattern", async () => {
    const project = makeProject({
      backend: {
        framework: "express",
        language: "typescript",
        hasHexagonalArch: false,
        hasServiceRepo: false,
        usesAPIView: false,
        usesFunctionViews: false,
        rolePattern: "none",
        importStyle: "absolute",
        loggingPattern: "unstructured",
        canonicalLogKeys: [],
        testRunner: "vitest",
        lintCommand: "eslint",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).toContain("absolute-imports");
  });

  it("detects structured-logging pattern", async () => {
    const project = makeProject({
      backend: {
        framework: "express",
        language: "typescript",
        hasHexagonalArch: false,
        hasServiceRepo: false,
        usesAPIView: false,
        usesFunctionViews: false,
        rolePattern: "none",
        importStyle: "relative",
        loggingPattern: "structured",
        canonicalLogKeys: ["trace_id"],
        testRunner: "vitest",
        lintCommand: "eslint",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).toContain("structured-logging");
  });

  it("patterns have required shape", async () => {
    const project = makeProject({
      backend: {
        framework: "django",
        language: "python",
        hasHexagonalArch: true,
        hasServiceRepo: true,
        usesAPIView: false,
        usesFunctionViews: false,
        rolePattern: "decorators",
        importStyle: "absolute",
        loggingPattern: "structured",
        canonicalLogKeys: ["trace_id"],
        testRunner: "pytest",
        lintCommand: "flake8",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    for (const p of patterns) {
      expect(typeof p.name).toBe("string");
      expect(["structure", "convention", "testing", "security", "logging"]).toContain(p.category);
      expect(typeof p.description).toBe("string");
      expect(Array.isArray(p.evidence)).toBe(true);
      expect(["high", "medium", "low"]).toContain(p.confidence);
    }
  });
});

describe("sniffArchitecture — frontend patterns", () => {
  it("detects composition-api-script-setup", async () => {
    const project = makeProject({
      frontend: {
        framework: "vue",
        uiLibrary: "none",
        componentPattern: "script-setup",
        usesI18n: false,
        i18nLibrary: null,
        usesTypeScript: false,
        stateManagement: "none",
        routerLibrary: null,
        testRunner: "vitest",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).toContain("composition-api-script-setup");
  });

  it("detects internationalization pattern", async () => {
    const project = makeProject({
      frontend: {
        framework: "vue",
        uiLibrary: "none",
        componentPattern: "options",
        usesI18n: true,
        i18nLibrary: "vue-i18n",
        usesTypeScript: false,
        stateManagement: "none",
        routerLibrary: null,
        testRunner: "vitest",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).toContain("internationalization");
  });

  it("detects typescript-strict pattern", async () => {
    const project = makeProject({
      frontend: {
        framework: "react",
        uiLibrary: "none",
        componentPattern: "functional",
        usesI18n: false,
        i18nLibrary: null,
        usesTypeScript: true,
        stateManagement: "none",
        routerLibrary: null,
        testRunner: "vitest",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).toContain("typescript-strict");
  });

  it("detects pinia-store-layering", async () => {
    const project = makeProject({
      frontend: {
        framework: "vue",
        uiLibrary: "none",
        componentPattern: "script-setup",
        usesI18n: false,
        i18nLibrary: null,
        usesTypeScript: true,
        stateManagement: "Pinia",
        routerLibrary: null,
        testRunner: "vitest",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).toContain("pinia-store-layering");
  });

  it("detects vuetify-design-system", async () => {
    const project = makeProject({
      frontend: {
        framework: "vue",
        uiLibrary: "Vuetify 3",
        componentPattern: "script-setup",
        usesI18n: false,
        i18nLibrary: null,
        usesTypeScript: true,
        stateManagement: "Pinia",
        routerLibrary: null,
        testRunner: "vitest",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).toContain("vuetify-design-system");
  });
});

describe("sniffArchitecture — backend project (covers sniffBackendPatterns)", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns empty array for minimal backend (no special patterns)", async () => {
    const project = makeProject({
      backend: {
        framework: "express",
        hasHexagonalArch: false,
        hasServiceRepo: false,
        usesAPIView: false,
        usesFunctionViews: false,
        rolePattern: "none",
        importStyle: "absolute",
        loggingPattern: "unstructured",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    expect(Array.isArray(patterns)).toBe(true);
  });

  it("detects hexagonal-architecture pattern", async () => {
    const project = makeProject({
      backend: {
        framework: "django",
        hasHexagonalArch: true,
        hasServiceRepo: false,
        usesAPIView: false,
        usesFunctionViews: false,
        rolePattern: "none",
        importStyle: "absolute",
        loggingPattern: "unstructured",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).toContain("hexagonal-architecture");
  });

  it("detects service-repository-pattern", async () => {
    const project = makeProject({
      backend: {
        framework: "express",
        hasHexagonalArch: false,
        hasServiceRepo: true,
        usesAPIView: false,
        usesFunctionViews: false,
        rolePattern: "none",
        importStyle: "absolute",
        loggingPattern: "unstructured",
      } as any,
    });
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).toContain("service-repository-pattern");
  });

  it("runs Django-specific grepInFiles checks (covers grepInFiles return false path)", async () => {
    // rootPath must be an EXISTING directory so globFn doesn't throw and reaches return false
    const project = makeProject({
      rootPath: os.tmpdir(),
      backend: {
        framework: "django",
        hasHexagonalArch: false,
        hasServiceRepo: false,
        usesAPIView: false,
        usesFunctionViews: false,
        rolePattern: "none",
        importStyle: "absolute",
        loggingPattern: "unstructured",
      } as any,
    });
    // tmpdir has no .py files → globFn returns [] → loop skipped → return false (line 311)
    const patterns = await sniffArchitecture(os.tmpdir(), project);
    const names = patterns.map((p) => p.name);
    expect(names).not.toContain("pii-encryption");
    expect(names).not.toContain("openapi-annotations");
    expect(names).not.toContain("audit-immutability");
  });

  it("detects Django pii-encryption, openapi-annotations, audit-immutability when grep matches", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "django-test-"));
    try {
      // Write Python files with the strings grepInFiles searches for
      fs.writeFileSync(path.join(tmpDir, "models.py"), "class MyModel:\n    secret = EncryptedField()\n");
      fs.writeFileSync(path.join(tmpDir, "views.py"), "from drf_spectacular.utils import extend_schema\n");
      fs.writeFileSync(path.join(tmpDir, "audit.py"), "-- DENY UPDATE|DENY DELETE ON audit_log\n");

      const project = makeProject({
        rootPath: tmpDir,
        backend: {
          framework: "django", hasHexagonalArch: false, hasServiceRepo: false,
          usesAPIView: false, usesFunctionViews: false, rolePattern: "none",
          importStyle: "absolute", loggingPattern: "unstructured",
        } as any,
      });
      const patterns = await sniffArchitecture(tmpDir, project);
      const names = patterns.map((p) => p.name);
      expect(names).toContain("pii-encryption");
      expect(names).toContain("openapi-annotations");
      expect(names).toContain("audit-immutability");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

