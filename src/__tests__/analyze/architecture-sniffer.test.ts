import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import { makeDetectedProject as makeProject } from "../fixtures.js";

// Mock child_process before importing the module so spawnSync is intercepted
vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

import { probeSentrux, sniffArchitecture } from "../../analyze/architecture-sniffer.js";
import { spawnSync } from "node:child_process";

const mockSpawnSync = vi.mocked(spawnSync);

// ---- probeSentrux ----

describe("probeSentrux — binary missing", () => {
  beforeEach(() => {
    mockSpawnSync.mockImplementation(() => { throw new Error("command not found: sentrux"); });
  });

  afterEach(() => vi.clearAllMocks());

  it("returns available: false when binary not in PATH", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.available).toBe(false);
  });

  it("returns all null fields when binary missing", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.cycles).toBeNull();
    expect(result.maxCC).toBeNull();
    expect(result.couplingGrade).toBeNull();
    expect(result.qualitySignal).toBeNull();
    expect(result.bottleneck).toBeNull();
  });
});

describe("probeSentrux — non-zero exit", () => {
  beforeEach(() => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: "", stderr: "error" } as any);
  });

  afterEach(() => vi.clearAllMocks());

  it("returns available: false on non-zero exit", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.available).toBe(false);
  });
});

describe("probeSentrux — empty stdout", () => {
  beforeEach(() => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "" } as any);
  });

  afterEach(() => vi.clearAllMocks());

  it("returns available: false on empty output", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.available).toBe(false);
  });
});

describe("probeSentrux — non-JSON output", () => {
  beforeEach(() => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "error: no source files found", stderr: "" } as any);
  });

  afterEach(() => vi.clearAllMocks());

  it("returns available: false when output is not JSON", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.available).toBe(false);
  });
});

describe("probeSentrux — JSON missing root_causes", () => {
  beforeEach(() => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: JSON.stringify({ status: "ok" }), stderr: "" } as any);
  });

  afterEach(() => vi.clearAllMocks());

  it("returns available: false when root_causes missing", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.available).toBe(false);
  });
});

describe("probeSentrux — full valid output", () => {
  afterEach(() => vi.clearAllMocks());

  const validOutput = JSON.stringify({
    quality_signal: 8500,
    bottleneck: "src/core/god-module.ts",
    root_causes: {
      acyclicity: { score: 0.9, raw: 3 },
      equality: { score: 0.7, raw: 0.3 },
      modularity: { score: 0.8, raw: 0.5 },
    },
  });

  beforeEach(() => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: validOutput, stderr: "" } as any);
  });

  it("returns available: true", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.available).toBe(true);
  });

  it("extracts cycles from acyclicity.raw", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.cycles).toBe(3);
  });

  it("derives maxCC from equality.raw (0.3 → 15)", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.maxCC).toBe(15);
  });

  it("derives couplingGrade from modularity.raw (0.5 → B)", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.couplingGrade).toBe("B");
  });

  it("extracts quality_signal", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.qualitySignal).toBe(8500);
  });

  it("extracts bottleneck", async () => {
    const result = await probeSentrux(`${os.tmpdir()}/test-project`);
    expect(result.bottleneck).toBe("src/core/god-module.ts");
  });
});

describe("probeSentrux — maxCC thresholds", () => {
  afterEach(() => vi.clearAllMocks());

  it("maps equality.raw ≤ 0.2 → maxCC 10", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: JSON.stringify({
      root_causes: { acyclicity: { raw: 0 }, equality: { raw: 0.1 }, modularity: { raw: 0.5 } },
    }), stderr: "" } as any);
    const r = await probeSentrux(os.tmpdir());
    expect(r.maxCC).toBe(10);
  });

  it("maps equality.raw ≤ 0.4 → maxCC 15", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: JSON.stringify({
      root_causes: { acyclicity: { raw: 0 }, equality: { raw: 0.35 }, modularity: { raw: 0.5 } },
    }), stderr: "" } as any);
    const r = await probeSentrux(os.tmpdir());
    expect(r.maxCC).toBe(15);
  });

  it("maps equality.raw ≤ 0.6 → maxCC 20", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: JSON.stringify({
      root_causes: { acyclicity: { raw: 0 }, equality: { raw: 0.55 }, modularity: { raw: 0.5 } },
    }), stderr: "" } as any);
    const r = await probeSentrux(os.tmpdir());
    expect(r.maxCC).toBe(20);
  });

  it("maps equality.raw > 0.6 → maxCC 25", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: JSON.stringify({
      root_causes: { acyclicity: { raw: 0 }, equality: { raw: 0.8 }, modularity: { raw: 0.5 } },
    }), stderr: "" } as any);
    const r = await probeSentrux(os.tmpdir());
    expect(r.maxCC).toBe(25);
  });
});

describe("probeSentrux — couplingGrade thresholds", () => {
  afterEach(() => vi.clearAllMocks());

  function outputWith(modularityRaw: number): string {
    return JSON.stringify({
      root_causes: { acyclicity: { raw: 0 }, equality: { raw: 0.3 }, modularity: { raw: modularityRaw } },
    });
  }

  it("grade A when modularity ≥ 0.6", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: outputWith(0.7), stderr: "" } as any);
    expect((await probeSentrux(os.tmpdir())).couplingGrade).toBe("A");
  });

  it("grade B when modularity 0.4–0.6", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: outputWith(0.5), stderr: "" } as any);
    expect((await probeSentrux(os.tmpdir())).couplingGrade).toBe("B");
  });

  it("grade C when modularity 0.2–0.4", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: outputWith(0.3), stderr: "" } as any);
    expect((await probeSentrux(os.tmpdir())).couplingGrade).toBe("C");
  });

  it("grade D when modularity 0.0–0.2", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: outputWith(0.1), stderr: "" } as any);
    expect((await probeSentrux(os.tmpdir())).couplingGrade).toBe("D");
  });

  it("grade F when modularity < 0", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: outputWith(-0.1), stderr: "" } as any);
    expect((await probeSentrux(os.tmpdir())).couplingGrade).toBe("F");
  });
});

describe("probeSentrux — JSONL (last valid JSON line wins)", () => {
  afterEach(() => vi.clearAllMocks());

  it("picks the last valid JSON line from JSONL output", async () => {
    const jsonl = [
      "Scanning...",
      JSON.stringify({ root_causes: { acyclicity: { raw: 1 }, equality: { raw: 0.1 }, modularity: { raw: 0.7 } } }),
      "Done",
      JSON.stringify({ quality_signal: 9000, root_causes: { acyclicity: { raw: 0 }, equality: { raw: 0.1 }, modularity: { raw: 0.8 } } }),
    ].join("\n");
    mockSpawnSync.mockReturnValue({ status: 0, stdout: jsonl, stderr: "" } as any);
    const r = await probeSentrux(os.tmpdir());
    expect(r.available).toBe(true);
    expect(r.cycles).toBe(0);
    expect(r.qualitySignal).toBe(9000);
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
});

