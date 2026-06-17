// Ground-truth ledger (D1) — the spine of the correction-artifact loop.
//
// The AI flags uncertainties → a human resolves them → resolutions persist here as checked-in
// artifacts → the next run reads them FIRST and skips re-inference. The ledger is committed (it
// is shared team knowledge, unlike the per-developer skill-gen marker), so one human correction
// benefits every teammate and every machine.
//
// Authority order (used everywhere): confirmed ▸ detected ▸ inferred ▸ fallback. A confirmed
// ledger value ALWAYS wins and short-circuits re-inference for that key.
import path from "node:path";
import fs from "fs-extra";
import type { ConfirmableValue, GroundTruthLedger, ValueSource } from "../shared/types.js";

const LEDGER_VERSION = 1;

// Higher number = higher authority.
const SOURCE_RANK: Record<ValueSource, number> = {
  fallback: 0,
  inferred: 1,
  detected: 2,
  confirmed: 3,
};

/** Absolute path to the ledger for a project root. */
export function ledgerPath(root: string): string {
  return path.join(root, ".agent-smith", "ground-truth.json");
}

/** Read the ledger, or an empty one if absent/corrupt (never throws). */
export function readLedger(root: string): GroundTruthLedger {
  const file = ledgerPath(root);
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as GroundTruthLedger;
      if (parsed && typeof parsed === "object" && parsed.values) return parsed;
    }
  } catch {
    /* corrupt ledger → treat as empty rather than crashing a run */
  }
  return { version: LEDGER_VERSION, values: {} };
}

/** Write the ledger (creates .agent-smith/). */
export function writeLedger(root: string, ledger: GroundTruthLedger): void {
  const file = ledgerPath(root);
  fs.ensureDirSync(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(ledger, null, 2) + "\n", "utf-8");
}

/** The confirmed artifact for a key, or null if it isn't settled. */
export function getConfirmed(ledger: GroundTruthLedger, key: string): ConfirmableValue | null {
  const v = ledger.values[key];
  return v && v.source === "confirmed" ? v : null;
}

/**
 * Resolve a key by the single authority rule. `candidates` supplies whatever the current run
 * could derive (detected/inferred/fallback). A confirmed ledger value short-circuits and wins;
 * otherwise the highest-authority candidate is returned. Returns null if nothing is available.
 */
export function resolveAuthority<T>(
  ledger: GroundTruthLedger,
  key: string,
  candidates: Partial<Record<ValueSource, T>> = {},
): ConfirmableValue<T> | null {
  const confirmed = getConfirmed(ledger, key);
  if (confirmed) return confirmed as ConfirmableValue<T>;

  let best: { source: ValueSource; value: T } | null = null;
  for (const source of Object.keys(candidates) as ValueSource[]) {
    if (!(source in candidates)) continue;
    const value = candidates[source] as T;
    if (!best || SOURCE_RANK[source] > SOURCE_RANK[best.source]) {
      best = { source, value };
    }
  }
  return best ? { value: best.value, source: best.source } : null;
}

/**
 * Apply human confirmations to a ledger (pure). Each pair settles one key as a confirmed
 * artifact. `at` is stamped by the caller (this module stays clock-free for determinism).
 */
export function applyConfirmations(
  ledger: GroundTruthLedger,
  pairs: Array<{ key: string; value: unknown }>,
  by: string,
  at: string,
): GroundTruthLedger {
  const values = { ...ledger.values };
  for (const { key, value } of pairs) {
    values[key] = { value, source: "confirmed", by };
  }
  return { ...ledger, version: ledger.version || LEDGER_VERSION, confirmedAt: at, values };
}

/**
 * Find confirmed keys whose human-settled value no longer matches the repo's current detected
 * value — these should be surfaced for RE-confirmation, never silently overwritten (a human
 * value always survives until a human changes it).
 */
export function findStale(
  ledger: GroundTruthLedger,
  detected: Record<string, unknown>,
): Array<{ key: string; confirmed: unknown; detected: unknown }> {
  const stale: Array<{ key: string; confirmed: unknown; detected: unknown }> = [];
  for (const [key, entry] of Object.entries(ledger.values)) {
    if (entry.source !== "confirmed") continue;
    if (key in detected && !valuesEqual(entry.value, detected[key])) {
      stale.push({ key, confirmed: entry.value, detected: detected[key] });
    }
  }
  return stale;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
