// C2 — the D1-topped authority layer: confirmed ledger values override detection and
// short-circuit re-inference; unconfirmed/unproven keys are flagged for human resolution.
import { describe, it, expect } from "vitest";
import { applyConfirmedOverrides, collectUnconfirmed, LEDGER_KEY_TO_VAR } from "../../analyze/ground-truth-overrides.js";
import { applyConfirmations } from "../../artifacts/ground-truth.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";
import type { GroundTruthLedger, TemplateVariables } from "../../shared/types.js";

const emptyLedger = (): GroundTruthLedger => ({ version: 1, values: {} });

describe("applyConfirmedOverrides (C2)", () => {
  it("a confirmed command wins over the detected value", () => {
    const vars: TemplateVariables = { ...DEFAULT_TEMPLATE_VARS, BACKEND_TEST_CMD: "go test ./..." };
    const ledger = applyConfirmations(emptyLedger(), [{ key: "backend.testCommand", value: "go test -race ./..." }], "human", "t");
    expect(applyConfirmedOverrides(vars, ledger).BACKEND_TEST_CMD).toBe("go test -race ./...");
  });

  it("renders a confirmed explicit null as honest 'none' (e.g. no ORM)", () => {
    const vars: TemplateVariables = { ...DEFAULT_TEMPLATE_VARS, ORM: "sqlc" };
    const ledger = applyConfirmations(emptyLedger(), [{ key: "backend.orm", value: null }], "human", "t");
    expect(applyConfirmedOverrides(vars, ledger).ORM).toBe("none");
  });

  it("stringifies a confirmed non-object primitive (e.g. boolean) value", () => {
    const vars: TemplateVariables = { ...DEFAULT_TEMPLATE_VARS, ORM: "Prisma" };
    const ledger = applyConfirmations(emptyLedger(), [{ key: "backend.orm", value: true as unknown as string }], "human", "t");
    expect(applyConfirmedOverrides(vars, ledger).ORM).toBe("true");
  });

  it("leaves detection untouched for keys not in the ledger", () => {
    const vars: TemplateVariables = { ...DEFAULT_TEMPLATE_VARS, BACKEND_LINT_CMD: "golangci-lint run" };
    expect(applyConfirmedOverrides(vars, emptyLedger()).BACKEND_LINT_CMD).toBe("golangci-lint run");
  });

  it("does not mutate the input vars", () => {
    const vars: TemplateVariables = { ...DEFAULT_TEMPLATE_VARS, BACKEND_TEST_CMD: "x" };
    const ledger = applyConfirmations(emptyLedger(), [{ key: "backend.testCommand", value: "y" }], "human", "t");
    applyConfirmedOverrides(vars, ledger);
    expect(vars.BACKEND_TEST_CMD).toBe("x");
  });
});

describe("collectUnconfirmed (C2)", () => {
  it("flags unproven keys (none/empty) that are not yet confirmed", () => {
    const vars: TemplateVariables = { ...DEFAULT_TEMPLATE_VARS, BACKEND_TEST_CMD: "none", BACKEND_LINT_CMD: "golangci-lint run" };
    const keys = collectUnconfirmed(vars, emptyLedger()).map((u) => u.key);
    expect(keys).toContain("backend.testCommand");   // none → flagged
    expect(keys).not.toContain("backend.lintCommand"); // proven → not flagged
  });

  it("does not flag a key once it is confirmed in the ledger", () => {
    const vars: TemplateVariables = { ...DEFAULT_TEMPLATE_VARS, BACKEND_TEST_CMD: "none" };
    const ledger = applyConfirmations(emptyLedger(), [{ key: "backend.testCommand", value: "go test ./..." }], "human", "t");
    const keys = collectUnconfirmed(vars, ledger).map((u) => u.key);
    expect(keys).not.toContain("backend.testCommand");
  });

  it("every ledger key maps to a real TemplateVariables field", () => {
    for (const field of Object.values(LEDGER_KEY_TO_VAR)) {
      expect(field in DEFAULT_TEMPLATE_VARS).toBe(true);
    }
  });
});
