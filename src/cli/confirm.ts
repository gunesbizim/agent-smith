// confirm command (D1) — write human resolutions into the ground-truth ledger.
//
//   agent-smith confirm backend.testCommand="go test ./..." backend.orm=null
//   agent-smith confirm --list
//
// Each key=value pair is settled as a confirmed artifact a future run reads first (skipping
// re-inference). Values are parsed as JSON when possible (so `null`, numbers, booleans, quoted
// strings work), else kept as raw strings.
import chalk from "chalk";
import path from "node:path";
import { readLedger, writeLedger, applyConfirmations } from "../artifacts/ground-truth.js";
import { analyzeProject } from "../analyze/analyze-project.js";
import { collectUnconfirmed } from "../analyze/ground-truth-overrides.js";

/**
 * A3 (D1 scope) — the uncertainty surface. Run the deterministic analysis and return the keys
 * whose detected value is unproven (none/empty) and not yet human-confirmed. These are exactly
 * what the human should resolve via `agent-smith confirm`. Best-effort; [] if analysis fails.
 */
export async function unconfirmedForRoot(root: string): Promise<Array<{ key: string; current: string }>> {
  try {
    const { templateVars, ledger } = await analyzeProject(root, { useLlm: false });
    return collectUnconfirmed(templateVars, ledger);
  } catch {
    return [];
  }
}

interface ConfirmOptions {
  dir?: string;
  list?: boolean;
}

/** Parse "key=value" → { key, value } with JSON-aware value coercion. Exported for tests. */
export function parseConfirmPair(pair: string): { key: string; value: unknown } {
  const eq = pair.indexOf("=");
  if (eq < 0) throw new Error(`invalid confirmation "${pair}" — expected key=value`);
  const key = pair.slice(0, eq).trim();
  const raw = pair.slice(eq + 1);
  if (!key) throw new Error(`invalid confirmation "${pair}" — empty key`);
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw; // keep as a plain string when it isn't valid JSON
  }
  return { key, value };
}

export async function confirmCommand(pairs: string[], opts: ConfirmOptions = {}): Promise<void> {
  const root = opts.dir ? path.resolve(opts.dir) : process.cwd();
  const ledger = readLedger(root);

  if (opts.list || pairs.length === 0) {
    const entries = Object.entries(ledger.values).filter(([, v]) => v.source === "confirmed");
    console.log(chalk.bold.cyan("\n⚒ Ground-truth ledger — confirmed values\n"));
    if (entries.length === 0) {
      console.log(chalk.gray("  (none yet — nothing has been confirmed)"));
    }
    for (const [key, v] of entries) {
      console.log(`  ${chalk.green("✓")} ${chalk.white(key)} = ${chalk.gray(JSON.stringify(v.value))}`);
    }

    // A3 (D1 scope) — surface the uncertainty: detected values still unproven and unconfirmed.
    const unconfirmed = await unconfirmedForRoot(root);
    console.log(chalk.bold.yellow("\n⚒ Unconfirmed — detected values worth settling\n"));
    if (unconfirmed.length === 0) {
      console.log(chalk.gray("  (none — every tracked value is confirmed or proven by detection)\n"));
    } else {
      for (const u of unconfirmed) {
        console.log(`  ${chalk.yellow("?")} ${chalk.white(u.key)} ${chalk.gray(`(currently: ${u.current})`)}`);
      }
      console.log(chalk.gray('\n  Settle one with: agent-smith confirm key="value"\n'));
    }
    return;
  }

  const parsed = pairs.map(parseConfirmPair);
  const updated = applyConfirmations(ledger, parsed, "human", new Date().toISOString());
  writeLedger(root, updated);

  console.log(chalk.bold.cyan("\n⚒ Confirmed values written to the ground-truth ledger\n"));
  for (const { key, value } of parsed) {
    console.log(`  ${chalk.green("✓")} ${chalk.white(key)} = ${chalk.gray(JSON.stringify(value))}`);
  }
  console.log(chalk.gray("\n  Commit .agent-smith/ground-truth.json so the whole team benefits.\n"));
}
