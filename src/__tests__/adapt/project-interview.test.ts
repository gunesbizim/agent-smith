import { describe, it, expect } from "vitest";
import { applyInterviewAnswers } from "../../adapt/project-interview.js";
import type { TemplateVariables } from "../../shared/types.js";
import type { InterviewAnswers } from "../../adapt/project-interview.js";

function makeVars(overrides: Partial<TemplateVariables> = {}): TemplateVariables {
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
    FRONTEND_FRAMEWORK: "none",
    FRONTEND_UI_LIBRARY: "none",
    FRONTEND_TEST_CMD: "",
    FRONTEND_LINT_CMD: "",
    FRONTEND_TYPE_CHECK_CMD: "",
    FRONTEND_DIR: "",
    FRONTEND_DEV_SERVER_CMD: "",
    ROLE_SYSTEM: "none",
    ROLE_VALID_VALUES: "",
    AUTH_METHOD: "none",
    IMPORT_STYLE: "absolute",
    DB_ENGINE: "postgresql",
    ORM: "none",
    PRE_PUSH_GATES: "none",
    API_DOCS_LIBRARY: "none",
    SENTRUX_MAX_CYCLES: "",
    SENTRUX_MAX_CC: "25",
    SENTRUX_MAX_COUPLING: "C",
    SENTRUX_LAYERS: "",
    SENTRUX_BOUNDARIES: "",
    PROJECT_NAME: "my-project",
    REPO_NAME: "my-project",
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
    PR_CHECKLIST: "tests pass",
    ...overrides,
  };
}

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
