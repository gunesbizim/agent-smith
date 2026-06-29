// AGENTS.md cleanup — remove the gitnexus-authored AGENTS.md once its tool info lives in CLAUDE.md.
//
// gitnexus writes an `AGENTS.md` at the project root, delimited by `<!-- gitnexus:start -->` /
// `<!-- gitnexus:end -->`, duplicating tool/skill pointers that agent-smith now consolidates into
// the CLAUDE.md managed block (the file Claude Code actually reads every session). agent-smith
// never authors AGENTS.md, so removing the gitnexus-managed one keeps a single source of truth.
//
// We only delete a file that is recognisably gitnexus-authored (its start marker is present). A
// hand-written AGENTS.md with no gitnexus markers is left untouched.
import path from "node:path";
import fs from "fs-extra";

/** The marker gitnexus writes at the top of the block it manages in AGENTS.md. */
export const GITNEXUS_AGENTS_MARKER = "<!-- gitnexus:start -->";

/**
 * Delete `<targetDir>/AGENTS.md` when it is gitnexus-authored (contains GITNEXUS_AGENTS_MARKER).
 * Returns true when a file was removed. No-op (returns false) when the file is missing, unreadable,
 * or has no gitnexus marker (i.e. hand-written). Best-effort: never throws.
 */
export function removeGitnexusAgentsMd(targetDir: string): boolean {
  const agentsPath = path.join(targetDir, "AGENTS.md");
  try {
    if (!fs.existsSync(agentsPath)) return false;
    const content = fs.readFileSync(agentsPath, "utf-8");
    if (!content.includes(GITNEXUS_AGENTS_MARKER)) return false;
    fs.removeSync(agentsPath);
    return true;
  } catch {
    return false;
  }
}
