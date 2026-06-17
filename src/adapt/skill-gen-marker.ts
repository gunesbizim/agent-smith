// First-run skill-generation marker (P3). A checked-in fact recording that LLM skill
// generation already ran for this repo, so a re-run of `init` skips the expensive generation
// step unless `--regen-skills` is passed. This is the simplest correction-artifact (a fact a
// later run reads to skip work) and is intended to fold into the D1 ground-truth ledger later.
//
// The module is PURE: the caller stamps `generatedAt` (it owns the clock) and passes the
// version, so this stays deterministic and testable.
import path from "node:path";
import fs from "fs-extra";

export interface SkillGenMarker {
  /** ISO timestamp, stamped by the caller. */
  generatedAt: string;
  /** Human stack label the skills were grounded in, e.g. "Go 1.22 / Echo". */
  stack?: string;
  /** Skill names that were (re)written. */
  skills?: string[];
  /** agent-smith version that produced the marker. */
  agentSmithVersion?: string;
}

/** Absolute path to the marker file for a project root. */
export function markerPath(root: string): string {
  return path.join(root, ".claude", ".agent-smith", "skills-generated.json");
}

/** Read + parse the marker, or null if it is absent or unreadable/corrupt. */
export function readMarker(root: string): SkillGenMarker | null {
  const file = markerPath(root);
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as SkillGenMarker;
  } catch {
    return null; // a corrupt marker should not crash init — treat as "not generated"
  }
}

/** Write the marker, creating the .claude/.agent-smith dir as needed. */
export function writeMarker(root: string, data: SkillGenMarker): void {
  const file = markerPath(root);
  fs.ensureDirSync(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
}
