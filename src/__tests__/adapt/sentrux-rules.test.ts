import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { writeSentruxRules } from "../../adapt/architecture-writer.js";
import type { TemplateVariables } from "../../shared/types.js";

// Minimal TemplateVariables — only populate fields; other fields default to empty strings
function makeVars(overrides: Partial<TemplateVariables>): TemplateVariables {
  return {
    BACKEND_LANG: "TypeScript",
    BACKEND_FRAMEWORK: "express",
    BACKEND_FRAMEWORK_DETAIL: "Express 4",
    BACKEND_TEST_CMD: "npx vitest run",
    BACKEND_LINT_CMD: "npx eslint src",
    BACKEND_TYPE_CHECK_CMD: "npx tsc --noEmit",
    BACKEND_FORMAT_CMD: "npx prettier --check .",
    BACKEND_DIR: "src",
    BACKEND_SETTINGS_MODULE: "",
    BACKEND_MIGRATE_CMD: "",
    FRONTEND_FRAMEWORK: "react",
    FRONTEND_UI_LIBRARY: "none",
    FRONTEND_TEST_CMD: "npx vitest run",
    FRONTEND_LINT_CMD: "npx eslint src",
    FRONTEND_TYPE_CHECK_CMD: "npx tsc --noEmit",
    FRONTEND_DIR: "frontend",
    FRONTEND_DEV_SERVER_CMD: "npm run dev",
    ROLE_SYSTEM: "none",
    ROLE_VALID_VALUES: "",
    AUTH_METHOD: "none",
    IMPORT_STYLE: "absolute",
    DB_ENGINE: "postgresql",
    ORM: "none",
    PRE_PUSH_GATES: "none",
    API_DOCS_LIBRARY: "none",
    SENTRUX_MAX_CYCLES: "0",
    SENTRUX_MAX_CC: "25",
    SENTRUX_MAX_COUPLING: "B",
    SENTRUX_LAYERS: "",
    SENTRUX_BOUNDARIES: "",
    PROJECT_NAME: "test-project",
    REPO_NAME: "test-project",
    GIT_HOST: "github.com",
    LOGGING_PATTERN: "unstructured",
    LOGGING_CANONICAL_KEYS: "",
    ORM_PACKAGE: "none",
    ORM_PACKAGE_VERSION: "",
    AUTH_PACKAGE: "none",
    AUTH_PACKAGE_VERSION: "",
    VALIDATION_PACKAGE: "none",
    VALIDATION_PACKAGE_VERSION: "",
    LOGGING_PACKAGE: "none",
    LOGGING_PACKAGE_VERSION: "",
    DB_DRIVER_PACKAGE: "none",
    DB_DRIVER_PACKAGE_VERSION: "",
    CACHE_PACKAGE: "none",
    CACHE_PACKAGE_VERSION: "",
    UI_PACKAGE: "none",
    UI_PACKAGE_VERSION: "",
    STATE_PACKAGE: "none",
    STATE_PACKAGE_VERSION: "",
    FORM_PACKAGE: "none",
    FORM_PACKAGE_VERSION: "",
    ROUTER_PACKAGE: "none",
    ROUTER_PACKAGE_VERSION: "",
    RENDER_PACKAGE: "none",
    RENDER_PACKAGE_VERSION: "",
    TEST_FRAMEWORK_PACKAGE: "none",
    TEST_FRAMEWORK_PACKAGE_VERSION: "",
    E2E_PACKAGE: "none",
    E2E_PACKAGE_VERSION: "",
    MOCK_PACKAGE: "none",
    MOCK_PACKAGE_VERSION: "",
    TESTING_REQUIREMENTS: "unit tests",
    PR_CHECKLIST: "tests pass, lint clean",
    ...overrides,
  };
}

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-smith-sentrux-test-"));
});

afterAll(async () => {
  await fs.remove(tmpDir);
});

describe("writeSentruxRules — enforce mode (max_cycles=0)", () => {
  let rulesPath: string;
  let content: string;

  beforeAll(async () => {
    const projectDir = path.join(tmpDir, "enforce-mode");
    await fs.emptyDir(projectDir);
    const vars = makeVars({
      SENTRUX_MAX_CYCLES: "0",
      SENTRUX_MAX_CC: "25",
      SENTRUX_MAX_COUPLING: "B",
      SENTRUX_LAYERS: [
        '[[layers]]',
        'name = "core"',
        'paths = ["src/core/*"]',
        'order = 1',
      ].join("\n"),
      SENTRUX_BOUNDARIES: [
        '[[boundaries]]',
        'from = "src/app/*"',
        'to = "src/core/internal/*"',
        'reason = "internal modules must not be imported from app layer"',
      ].join("\n"),
    });
    await writeSentruxRules(projectDir, vars);
    rulesPath = path.join(projectDir, ".sentrux", "rules.toml");
    content = await fs.readFile(rulesPath, "utf-8");
  });

  it("writes .sentrux/rules.toml", async () => {
    expect(await fs.pathExists(rulesPath)).toBe(true);
  });

  it("contains [constraints] section", () => {
    expect(content).toContain("[constraints]");
  });

  it("sets max_cycles = 0 (enforce mode)", () => {
    expect(content).toMatch(/max_cycles\s*=\s*0/);
  });

  it("max_cycles line is not commented out", () => {
    // The line must not start with '#'
    const lines = content.split("\n");
    const cyclesLine = lines.find((l) => l.includes("max_cycles") && !l.trimStart().startsWith("#"));
    expect(cyclesLine).toBeDefined();
  });

  it("sets max_cc = 25", () => {
    expect(content).toMatch(/max_cc\s*=\s*25/);
  });

  it("sets max_coupling = \"B\"", () => {
    expect(content).toMatch(/max_coupling\s*=\s*"B"/);
  });

  it("includes [[layers]] block", () => {
    expect(content).toContain("[[layers]]");
    expect(content).toContain('name = "core"');
    expect(content).toContain('paths = ["src/core/*"]');
  });

  it("includes [[boundaries]] block", () => {
    expect(content).toContain("[[boundaries]]");
    expect(content).toContain('from = "src/app/*"');
    expect(content).toContain('to = "src/core/internal/*"');
  });
});

describe("writeSentruxRules — ratchet mode (max_cycles > 0)", () => {
  let content: string;

  beforeAll(async () => {
    const projectDir = path.join(tmpDir, "ratchet-mode");
    await fs.emptyDir(projectDir);
    const vars = makeVars({
      SENTRUX_MAX_CYCLES: "7",
      SENTRUX_MAX_CC: "30",
      SENTRUX_MAX_COUPLING: "C",
      SENTRUX_LAYERS: "",
      SENTRUX_BOUNDARIES: "",
    });
    await writeSentruxRules(projectDir, vars);
    const rulesPath = path.join(projectDir, ".sentrux", "rules.toml");
    content = await fs.readFile(rulesPath, "utf-8");
  });

  it("sets max_cycles = 7 in ratchet mode", () => {
    expect(content).toMatch(/max_cycles\s*=\s*7/);
  });

  it("max_cycles line is not commented out in ratchet mode", () => {
    const lines = content.split("\n");
    const activeLine = lines.find(
      (l) => l.includes("max_cycles") && !l.trimStart().startsWith("#"),
    );
    expect(activeLine).toBeDefined();
  });

  it("contains [constraints] section", () => {
    expect(content).toContain("[constraints]");
  });
});

describe("writeSentruxRules — advisory fallback (max_cycles unknown/empty)", () => {
  it("comments out max_cycles when SENTRUX_MAX_CYCLES is empty string", async () => {
    const projectDir = path.join(tmpDir, "advisory-empty");
    await fs.emptyDir(projectDir);
    const vars = makeVars({ SENTRUX_MAX_CYCLES: "" });
    await writeSentruxRules(projectDir, vars);
    const rulesPath = path.join(projectDir, ".sentrux", "rules.toml");
    const content = await fs.readFile(rulesPath, "utf-8");
    // max_cycles must either be absent or appear only in a comment
    const lines = content.split("\n");
    const activeLine = lines.find(
      (l) => l.includes("max_cycles") && !l.trimStart().startsWith("#"),
    );
    expect(activeLine).toBeUndefined();
  });

  it("comments out max_cycles when SENTRUX_MAX_CYCLES is 'unknown'", async () => {
    const projectDir = path.join(tmpDir, "advisory-unknown");
    await fs.emptyDir(projectDir);
    const vars = makeVars({ SENTRUX_MAX_CYCLES: "unknown" });
    await writeSentruxRules(projectDir, vars);
    const rulesPath = path.join(projectDir, ".sentrux", "rules.toml");
    const content = await fs.readFile(rulesPath, "utf-8");
    const lines = content.split("\n");
    const activeLine = lines.find(
      (l) => l.includes("max_cycles") && !l.trimStart().startsWith("#"),
    );
    expect(activeLine).toBeUndefined();
  });

  it("still writes [constraints] section in advisory fallback", async () => {
    const projectDir = path.join(tmpDir, "advisory-constraints");
    await fs.emptyDir(projectDir);
    const vars = makeVars({ SENTRUX_MAX_CYCLES: "" });
    await writeSentruxRules(projectDir, vars);
    const rulesPath = path.join(projectDir, ".sentrux", "rules.toml");
    const content = await fs.readFile(rulesPath, "utf-8");
    expect(content).toContain("[constraints]");
  });
});

describe("writeSentruxRules — multiple layers and boundaries", () => {
  let content: string;

  beforeAll(async () => {
    const projectDir = path.join(tmpDir, "multi-layers");
    await fs.emptyDir(projectDir);
    const vars = makeVars({
      SENTRUX_MAX_CYCLES: "0",
      SENTRUX_MAX_CC: "20",
      SENTRUX_MAX_COUPLING: "A",
      SENTRUX_LAYERS: [
        '[[layers]]',
        'name = "core"',
        'paths = ["src/core/*"]',
        'order = 1',
        '',
        '[[layers]]',
        'name = "app"',
        'paths = ["src/app/*"]',
        'order = 2',
      ].join("\n"),
      SENTRUX_BOUNDARIES: [
        '[[boundaries]]',
        'from = "src/app/*"',
        'to = "src/core/internal/*"',
        'reason = "app must not access internal core"',
        '',
        '[[boundaries]]',
        'from = "src/core/*"',
        'to = "src/app/*"',
        'reason = "core must not depend on app"',
      ].join("\n"),
    });
    await writeSentruxRules(projectDir, vars);
    const rulesPath = path.join(projectDir, ".sentrux", "rules.toml");
    content = await fs.readFile(rulesPath, "utf-8");
  });

  it("includes both layer entries", () => {
    expect(content).toContain('name = "core"');
    expect(content).toContain('name = "app"');
  });

  it("includes both boundary entries", () => {
    expect(content).toContain('reason = "app must not access internal core"');
    expect(content).toContain('reason = "core must not depend on app"');
  });
});

describe("writeSentruxRules — dry run", () => {
  it("does not write file in dry run mode", async () => {
    const projectDir = path.join(tmpDir, "dry-run");
    await fs.emptyDir(projectDir);
    const vars = makeVars({ SENTRUX_MAX_CYCLES: "0" });
    await writeSentruxRules(projectDir, vars, true);
    const rulesPath = path.join(projectDir, ".sentrux", "rules.toml");
    expect(await fs.pathExists(rulesPath)).toBe(false);
  });
});
