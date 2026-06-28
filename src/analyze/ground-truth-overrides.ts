// C2 — apply the D1 ground-truth ledger over mapped template variables.
//
// This is the read-first layer that makes detection D1-topped: a human-confirmed value in the
// ledger ALWAYS wins and short-circuits detection/LLM/fallback for that key. It is the source of
// C2's compounding token saving — once a command/fact is confirmed, no run re-infers it.
//
// Authority order (the single rule): confirmed (ledger) ▸ detected-in-repo ▸ LLM-derived ▸
// labeled static fallback. Detection already produced (b)–(d) into `vars`; this step layers (a).
import type { GroundTruthLedger, TemplateVariables } from "../shared/types.js";
import { getConfirmed } from "../artifacts/ground-truth.js";

// Stable dotted ledger keys → the template variable they settle. Consumers (`agent-smith
// confirm backend.testCommand="…"`) use these exact keys, so they are the contract.
export const LEDGER_KEY_TO_VAR: Record<string, keyof TemplateVariables> = {
  "backend.framework": "BACKEND_FRAMEWORK",
  "backend.language": "BACKEND_LANG",
  "backend.testCommand": "BACKEND_TEST_CMD",
  "backend.lintCommand": "BACKEND_LINT_CMD",
  "backend.formatCommand": "BACKEND_FORMAT_CMD",
  "backend.typecheckCommand": "BACKEND_TYPE_CHECK_CMD",
  "backend.migrateCommand": "BACKEND_MIGRATE_CMD",
  "backend.orm": "ORM",
  "backend.authMethod": "AUTH_METHOD",
  "backend.dbEngine": "DB_ENGINE",
  "frontend.framework": "FRONTEND_FRAMEWORK",
  "frontend.uiLibrary": "FRONTEND_UI_LIBRARY",
  "frontend.testCommand": "FRONTEND_TEST_CMD",
  "frontend.lintCommand": "FRONTEND_LINT_CMD",
  "frontend.typecheckCommand": "FRONTEND_TYPE_CHECK_CMD",
  "frontend.devServerCommand": "FRONTEND_DEV_SERVER_CMD",
};

// A confirmed value renders as this when it is an explicit null (e.g. "no ORM").
function renderConfirmed(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  // value is a non-object primitive (number, boolean, bigint, symbol) — safe to stringify explicitly
  return String(value as number | boolean | bigint | symbol);
}

/**
 * Override `vars` with any CONFIRMED ledger values (pure). A confirmed value wins over whatever
 * detection produced — this is the load-bearing read-first behavior of the correction-artifact
 * loop. Returns a new object; `vars` is not mutated.
 */
export function applyConfirmedOverrides(
  vars: TemplateVariables,
  ledger: GroundTruthLedger,
): TemplateVariables {
  const out: TemplateVariables = { ...vars };
  for (const [key, field] of Object.entries(LEDGER_KEY_TO_VAR)) {
    const confirmed = getConfirmed(ledger, key);
    if (confirmed) {
      (out[field] as string) = renderConfirmed(confirmed.value);
    }
  }
  return out;
}

/**
 * Identify command/fact keys that are still UNCONFIRMED — either absent from the ledger or only
 * detected/inferred — and whose current value looks unproven ("none"/empty). These are the
 * candidates D1 routes to a human (`agent-smith confirm`). Pure; no I/O.
 */
export function collectUnconfirmed(
  vars: TemplateVariables,
  ledger: GroundTruthLedger,
): Array<{ key: string; current: string }> {
  const unconfirmed: Array<{ key: string; current: string }> = [];
  for (const [key, field] of Object.entries(LEDGER_KEY_TO_VAR)) {
    if (getConfirmed(ledger, key)) continue; // already settled by a human
    const current = String(vars[field] ?? "");
    if (current === "" || current === "none" || current === "unknown") {
      unconfirmed.push({ key, current: current || "none" });
    }
  }
  return unconfirmed;
}
