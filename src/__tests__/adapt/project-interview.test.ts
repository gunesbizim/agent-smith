import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { applyInterviewAnswers, buildQuestions, smartDefaults, runInterview } from "../../adapt/project-interview.js";
import { makeTemplateVars as makeVars, makeDetectedProject } from "../fixtures.js";
import type { InterviewAnswers, SentruxProbeDefaults } from "../../adapt/project-interview.js";

vi.mock("node:readline", () => {
  const mockInterface = {
    question: vi.fn().mockImplementation((_prompt: string, cb: (input: string) => void) => cb("")),
    close: vi.fn(),
  };
  return { default: { createInterface: vi.fn().mockReturnValue(mockInterface) } };
});

function makeAnswers(overrides: Partial<InterviewAnswers> = {}): InterviewAnswers {
  return {
    branchNaming: "feature/<ticket>-<name>",
    commitFormat: "type(scope): TICKET-XX description",
    ticketPrefix: "PROJ-",
    prChecklist: [],
    testingRequirements: [],
    architectureRules: [],
    securityRequirements: [],
    codeStyle: [],
    customNotes: "",
    allowCycles: "no",
    maxCC: "25",
    ...overrides,
  };
}

describe("applyInterviewAnswers — testingRequirements", () => {
  it("injects testing requirements when non-empty", () => {
    const vars = makeVars();
    const answers = makeAnswers({ testingRequirements: ["unit tests", "E2E for critical paths"] });
    const result = applyInterviewAnswers(vars, answers);
    expect(result.TESTING_REQUIREMENTS).toBe("unit tests; E2E for critical paths");
  });

  it("preserves original TESTING_REQUIREMENTS when interview list is empty", () => {
    const vars = makeVars({ TESTING_REQUIREMENTS: "original requirement" });
    const answers = makeAnswers({ testingRequirements: [] });
    const result = applyInterviewAnswers(vars, answers);
    expect(result.TESTING_REQUIREMENTS).toBe("original requirement");
  });
});

describe("applyInterviewAnswers — prChecklist", () => {
  it("injects prChecklist when non-empty", () => {
    const vars = makeVars();
    const answers = makeAnswers({ prChecklist: ["tests pass", "lint clean", "1+ approval"] });
    const result = applyInterviewAnswers(vars, answers);
    expect(result.PR_CHECKLIST).toBe("tests pass; lint clean; 1+ approval");
  });

  it("preserves original PR_CHECKLIST when interview list is empty", () => {
    const vars = makeVars({ PR_CHECKLIST: "original checklist" });
    const answers = makeAnswers({ prChecklist: [] });
    const result = applyInterviewAnswers(vars, answers);
    expect(result.PR_CHECKLIST).toBe("original checklist");
  });
});

describe("applyInterviewAnswers — customNotes", () => {
  it("appends customNotes to PROJECT_NAME when provided", () => {
    const vars = makeVars({ PROJECT_NAME: "my-project" });
    const answers = makeAnswers({ customNotes: "trunk-based development" });
    const result = applyInterviewAnswers(vars, answers);
    expect(result.PROJECT_NAME).toContain("my-project");
    expect(result.PROJECT_NAME).toContain("trunk-based development");
  });

  it("does not alter PROJECT_NAME when customNotes is empty", () => {
    const vars = makeVars({ PROJECT_NAME: "my-project" });
    const answers = makeAnswers({ customNotes: "" });
    const result = applyInterviewAnswers(vars, answers);
    expect(result.PROJECT_NAME).toBe("my-project");
  });
});

describe("applyInterviewAnswers — SENTRUX_MAX_CC", () => {
  it("overrides SENTRUX_MAX_CC when maxCC is a valid integer", () => {
    const vars = makeVars({ SENTRUX_MAX_CC: "25" });
    const answers = makeAnswers({ maxCC: "10" });
    const result = applyInterviewAnswers(vars, answers);
    expect(result.SENTRUX_MAX_CC).toBe("10");
  });

  it("preserves SENTRUX_MAX_CC when maxCC is empty", () => {
    const vars = makeVars({ SENTRUX_MAX_CC: "25" });
    const answers = makeAnswers({ maxCC: "" });
    const result = applyInterviewAnswers(vars, answers);
    expect(result.SENTRUX_MAX_CC).toBe("25");
  });

  it("preserves SENTRUX_MAX_CC when maxCC is non-numeric", () => {
    const vars = makeVars({ SENTRUX_MAX_CC: "25" });
    const answers = makeAnswers({ maxCC: "high" });
    const result = applyInterviewAnswers(vars, answers);
    expect(result.SENTRUX_MAX_CC).toBe("25");
  });
});

describe("applyInterviewAnswers — SENTRUX_MAX_CYCLES (allowCycles)", () => {
  it("forces SENTRUX_MAX_CYCLES to '0' when allowCycles is 'no' and no probe value set", () => {
    const vars = makeVars({ SENTRUX_MAX_CYCLES: "" });
    const answers = makeAnswers({ allowCycles: "no" });
    const result = applyInterviewAnswers(vars, answers);
    expect(result.SENTRUX_MAX_CYCLES).toBe("0");
  });

  it("forces SENTRUX_MAX_CYCLES to '0' when allowCycles is 'no' and probe returned unknown", () => {
    const vars = makeVars({ SENTRUX_MAX_CYCLES: "unknown" });
    const answers = makeAnswers({ allowCycles: "no" });
    const result = applyInterviewAnswers(vars, answers);
    expect(result.SENTRUX_MAX_CYCLES).toBe("0");
  });

  it("preserves probe-seeded ratchet value when allowCycles is 'no' and probe already set cycles", () => {
    const vars = makeVars({ SENTRUX_MAX_CYCLES: "5" });
    const answers = makeAnswers({ allowCycles: "no" });
    const result = applyInterviewAnswers(vars, answers);
    // probe already set a ratchet — do not force to 0
    expect(result.SENTRUX_MAX_CYCLES).toBe("5");
  });

  it("does not override probe ratchet when user allows cycles ('yes')", () => {
    const vars = makeVars({ SENTRUX_MAX_CYCLES: "7" });
    const answers = makeAnswers({ allowCycles: "yes" });
    const result = applyInterviewAnswers(vars, answers);
    expect(result.SENTRUX_MAX_CYCLES).toBe("7");
  });

  it("does not override empty cycles when user allows cycles", () => {
    const vars = makeVars({ SENTRUX_MAX_CYCLES: "" });
    const answers = makeAnswers({ allowCycles: "yes" });
    const result = applyInterviewAnswers(vars, answers);
    expect(result.SENTRUX_MAX_CYCLES).toBe("");
  });

  it("treats allowCycles starting with 'Y' (capital) as allow", () => {
    const vars = makeVars({ SENTRUX_MAX_CYCLES: "" });
    const answers = makeAnswers({ allowCycles: "Yes" });
    const result = applyInterviewAnswers(vars, answers);
    // should not force to 0
    expect(result.SENTRUX_MAX_CYCLES).toBe("");
  });
});

describe("applyInterviewAnswers — does not mutate input vars", () => {
  it("returns a new object without modifying vars in place", () => {
    const vars = makeVars({ SENTRUX_MAX_CYCLES: "" });
    const answers = makeAnswers({ allowCycles: "no" });
    applyInterviewAnswers(vars, answers);
    expect(vars.SENTRUX_MAX_CYCLES).toBe("");
  });
});

describe("applyInterviewAnswers — all fields pass through unchanged", () => {
  it("preserves unrelated vars fields", () => {
    const vars = makeVars({ BACKEND_LANG: "Python", DB_ENGINE: "mysql" });
    const answers = makeAnswers();
    const result = applyInterviewAnswers(vars, answers);
    expect(result.BACKEND_LANG).toBe("Python");
    expect(result.DB_ENGINE).toBe("mysql");
  });
});

// ---- buildQuestions ----

const makeProject = makeDetectedProject;

describe("buildQuestions — default (no sentrux probe)", () => {
  it("returns the expected question ids", () => {
    const qs = buildQuestions(makeProject());
    const ids = qs.map((q) => q.id);
    expect(ids).toContain("branchNaming");
    expect(ids).toContain("commitFormat");
    expect(ids).toContain("ticketPrefix");
    expect(ids).toContain("prChecklist");
    expect(ids).toContain("testingRequirements");
    expect(ids).toContain("architectureRules");
    expect(ids).toContain("securityRequirements");
    expect(ids).toContain("codeStyle");
    expect(ids).toContain("customNotes");
    expect(ids).toContain("allowCycles");
    expect(ids).toContain("maxCC");
  });

  it("allowCycles question has no cycles note when no probe", () => {
    const qs = buildQuestions(makeProject());
    const q = qs.find((q) => q.id === "allowCycles")!;
    expect(q.question).not.toContain("probe found");
  });

  it("maxCC defaultValue is '25' when no probe", () => {
    const qs = buildQuestions(makeProject());
    const q = qs.find((q) => q.id === "maxCC")!;
    expect(q.defaultValue).toBe("25");
  });

  it("every question has required shape", () => {
    const qs = buildQuestions(makeProject());
    for (const q of qs) {
      expect(typeof q.id).toBe("string");
      expect(typeof q.question).toBe("string");
      expect(typeof q.hint).toBe("string");
      expect(typeof q.defaultValue).toBe("string");
      expect(["text", "multi", "boolean"]).toContain(q.type);
    }
  });
});

describe("buildQuestions — with sentrux probe defaults", () => {
  const probe: SentruxProbeDefaults = { cycles: 3, maxCC: 15 };

  it("allowCycles question includes cycles note from probe", () => {
    const qs = buildQuestions(makeProject(), probe);
    const q = qs.find((q) => q.id === "allowCycles")!;
    expect(q.question).toContain("probe found 3 cycle");
  });

  it("maxCC defaultValue reflects probe maxCC", () => {
    const qs = buildQuestions(makeProject(), probe);
    const q = qs.find((q) => q.id === "maxCC")!;
    expect(q.defaultValue).toBe("15");
  });

  it("cycles note uses singular when cycles = 1", () => {
    const qs = buildQuestions(makeProject(), { cycles: 1, maxCC: null });
    const q = qs.find((q) => q.id === "allowCycles")!;
    expect(q.question).toContain("1 cycle)");
    expect(q.question).not.toContain("cycles)");
  });

  it("cycles note is absent when cycles is null", () => {
    const qs = buildQuestions(makeProject(), { cycles: null, maxCC: 20 });
    const q = qs.find((q) => q.id === "allowCycles")!;
    expect(q.question).not.toContain("probe found");
  });

  it("maxCC stays '25' when probe maxCC is null", () => {
    const qs = buildQuestions(makeProject(), { cycles: 0, maxCC: null });
    const q = qs.find((q) => q.id === "maxCC")!;
    expect(q.defaultValue).toBe("25");
  });
});

describe("buildQuestions — project-type-specific defaults", () => {
  it("frontend project uses frontend testing default", () => {
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
    const qs = buildQuestions(project);
    const q = qs.find((q) => q.id === "testingRequirements")!;
    expect(q.defaultValue).toContain("role/permission");
  });

  it("CLI project uses CLI testing default", () => {
    const project = makeProject({ projectType: "cli-tool" });
    const qs = buildQuestions(project);
    const q = qs.find((q) => q.id === "testingRequirements")!;
    expect(q.defaultValue).not.toContain("role/permission");
    expect(q.defaultValue).toContain("happy+error+edge");
  });
});

// ---- smartDefaults ----

describe("smartDefaults", () => {
  it("sets allowCycles to 'no' always", () => {
    const d = smartDefaults(makeProject());
    expect(d.allowCycles).toBe("no");
  });

  it("sets maxCC to '25' always", () => {
    const d = smartDefaults(makeProject());
    expect(d.maxCC).toBe("25");
  });

  it("CLI projects get branchNaming default", () => {
    const d = smartDefaults(makeProject({ projectType: "cli-tool" }));
    expect(d.branchNaming).toBeTruthy();
  });

  it("non-CLI projects get no branchNaming preset", () => {
    const d = smartDefaults(makeProject({ projectType: "library" }));
    expect(d.branchNaming).toBeUndefined();
  });
});

// ---- getDefaultTesting / getDefaultArchRules fallback branches ----

describe("buildQuestions — backend-only project (no frontend, not CLI)", () => {
  it("testingRequirements default includes integration tests (line 37 branch)", () => {
    const project = makeDetectedProject({
      projectType: "web-app",
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
      frontend: null,
    });
    const qs = buildQuestions(project);
    const q = qs.find((q) => q.id === "testingRequirements")!;
    expect(q.defaultValue).toContain("integration tests");
  });

  it("architectureRules default uses fallback (line 43 branch) for library with no backend", () => {
    const project = makeDetectedProject({ projectType: "library", backend: null, frontend: null });
    const qs = buildQuestions(project);
    const q = qs.find((q) => q.id === "architectureRules")!;
    expect(q.defaultValue).toContain("typed interfaces");
    expect(q.defaultValue).not.toContain("ORM");
  });
});

// ---- runInterview (readline mocked — all Enter → accepts defaults) ----

describe("runInterview — defaults accepted via mocked readline", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-smith-interview-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns a complete InterviewAnswers object", async () => {
    const project = makeDetectedProject();
    const answers = await runInterview(tmpDir, project);
    expect(typeof answers.branchNaming).toBe("string");
    expect(typeof answers.commitFormat).toBe("string");
    expect(typeof answers.allowCycles).toBe("string");
    expect(typeof answers.maxCC).toBe("string");
    expect(Array.isArray(answers.prChecklist)).toBe(true);
    expect(Array.isArray(answers.testingRequirements)).toBe(true);
    expect(Array.isArray(answers.architectureRules)).toBe(true);
  });

  it("writes decisions.md to docs/architecture/", async () => {
    const project = makeDetectedProject();
    await runInterview(tmpDir, project);
    const decPath = path.join(tmpDir, "docs", "architecture", "decisions.md");
    expect(fs.existsSync(decPath)).toBe(true);
    const content = fs.readFileSync(decPath, "utf-8");
    expect(content).toContain("Project Decisions");
  });

  it("accepts sentrux probe defaults and returns valid answers", async () => {
    const project = makeDetectedProject();
    const probe: SentruxProbeDefaults = { cycles: 2, maxCC: 12 };
    const answers = await runInterview(tmpDir, project, probe);
    expect(typeof answers.maxCC).toBe("string");
    expect(typeof answers.allowCycles).toBe("string");
  });
});
