// LLM-generated architecture docs — grounds backend/frontend-architecture.md in the
// real repository instead of a fixed template. Best-effort: returns null on any failure
// so the caller falls back to the deterministic template generator.
import { runClaude } from "../analyze/claude-runner.js";
import type { DetectedProject } from "../shared/types.js";

const ARCH_TIMEOUT_MS = 180_000;

type Side = "backend" | "frontend";

// Build the prompt that asks Claude to author one architecture doc from the real code.
function buildArchPrompt(side: Side, project: DetectedProject, templateReference: string): string {
  const detected =
    side === "backend"
      ? JSON.stringify({ projectType: project.projectType, backend: project.backend })
      : JSON.stringify({ projectType: project.projectType, frontend: project.frontend });

  return [
    `Author the ${side.toUpperCase()} architecture document for THIS repository.`,
    "You are in the project root. Inspect the actual source (use Read/Glob/Grep) to ground",
    "every statement in what the code really does — directory layout, layering, naming,",
    "auth, error handling, imports, testing. Do NOT invent rules the code does not follow.",
    "",
    `Heuristic detection (may be incomplete): ${detected}.`,
    "",
    "The document is the binding source of truth referenced by the as-backend/as-frontend,",
    "as-test, as-pr-review, and as-documentation skills. It must contain concrete, enforceable",
    "rules a reviewer can check — not generic advice.",
    "",
    "Cover: Stack; Project Structure (real directories); Layering & boundaries; Naming",
    "conventions; Imports; Auth/permissions (if any); Error handling; Logging; Testing",
    "expectations; and a 'Binding rules (PR blockers)' section.",
    "",
    "Use the structure of this reference document as a starting shape, but REPLACE its",
    "content with what is true for this repo (the reference assumes a different stack):",
    "",
    "<<<REFERENCE_TEMPLATE",
    templateReference,
    "REFERENCE_TEMPLATE",
    "",
    "Output ONLY the final Markdown document — no preamble, no code fences around the whole",
    "thing, no commentary. Start with a top-level '# ' heading.",
  ].join("\n");
}

// Strip a leading/trailing ```markdown fence if the model wrapped the whole doc.
// Plain line parsing (no regex) to avoid super-linear backtracking on large docs.
function unwrapFence(text: string): string {
  const trimmed = text.trim();
  const lines = trimmed.split("\n");
  const first = lines[0]?.trim() ?? "";
  const last = lines[lines.length - 1]?.trim() ?? "";
  const opensFence = first === "```" || first === "```markdown" || first === "```md";
  if (opensFence && last === "```" && lines.length >= 2) {
    return lines.slice(1, -1).join("\n").trim();
  }
  return trimmed;
}

// Generate one architecture doc via the LLM, grounded in the real repo. Returns the
// Markdown string, or null if claude is unavailable / fails / returns something unusable.
export function generateArchitectureDoc(
  side: Side,
  projectRoot: string,
  project: DetectedProject,
  templateReference: string,
): string | null {
  const prompt = buildArchPrompt(side, project, templateReference);
  const out = runClaude(prompt, {
    cwd: projectRoot,
    allowedTools: ["Read", "Glob", "Grep"],
    timeoutMs: ARCH_TIMEOUT_MS,
  });
  if (!out) return null;
  const doc = unwrapFence(out);
  // Sanity: a real architecture doc starts with a heading and has some substance.
  if (!doc.startsWith("#") || doc.length < 200) return null;
  return doc;
}
