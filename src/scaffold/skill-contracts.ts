// A4 — capability contracts (hybrid, layered over prompt skills).
//
// Skills remain Markdown prompts FOR Claude Code — not callable APIs (that would fight the
// runtime). A4 adds an OPTIONAL contract block to the YAML frontmatter for documentation,
// validation, and composition; the prompt body stays the executable artifact. Constraints are
// model-enforced (the generator must surface them in the prose), not type-enforced.
//
//   ---
//   name: test-backend
//   contractVersion: 1
//   inputs: [diff, architecture-docs]
//   outputs: [structured-report]
//   constraints: [must_add_tests, no_schema_changes]
//   ---

export interface SkillContract {
  contractVersion: number;
  inputs: string[];
  outputs: string[];
  constraints: string[];
}

// The recognized constraint vocabulary and the keyword(s) a skill body must mention to honor it.
// A constraint is satisfied when the prose references one of its keywords (consistency lint).
export const KNOWN_CONSTRAINTS: Record<string, string[]> = {
  must_add_tests: ["test", "tests"],
  no_schema_changes: ["schema", "migration"],
  no_new_dependencies: ["dependenc", "package"],
  fail_closed_auth: ["auth", "permission", "role"],
  i18n_required: ["i18n", "translation", "locale"],
  no_breaking_api_changes: ["api", "endpoint", "contract"],
};

function frontmatter(content: string): string | null {
  const m = /^---\n([\s\S]*?)\n---/.exec(content);
  return m ? m[1] : null;
}

// Minimal YAML-ish reader for the flat contract keys we support (scalars + inline `[a, b]` lists).
function readList(fm: string, key: string): string[] | null {
  const m = new RegExp(String.raw`^${key}:\s*\[(.*?)\]\s*$`, "m").exec(fm);
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
}

function readNumber(fm: string, key: string): number | null {
  const m = new RegExp(String.raw`^${key}:\s*(\d+)\s*$`, "m").exec(fm);
  return m ? Number(m[1]) : null;
}

/** Parse the optional contract block from a skill's frontmatter, or null if there is none. */
export function parseContract(content: string): SkillContract | null {
  const fm = frontmatter(content);
  if (!fm) return null;
  const hasContract = /^(contractVersion|inputs|outputs|constraints):/m.test(fm);
  if (!hasContract) return null;
  return {
    contractVersion: readNumber(fm, "contractVersion") ?? 0,
    inputs: readList(fm, "inputs") ?? [],
    outputs: readList(fm, "outputs") ?? [],
    constraints: readList(fm, "constraints") ?? [],
  };
}

/**
 * Validate a skill's contract (A4). Returns the list of issues; empty means valid (or no
 * contract present). Checks the contract is well-formed AND that the prompt body references each
 * declared constraint (the consistency lint — a declared rule the prose ignores is a bug).
 */
export function validateContract(content: string): string[] {
  const contract = parseContract(content);
  if (!contract) return []; // contracts are optional

  const issues: string[] = [];
  if (contract.contractVersion < 1) {
    issues.push("contractVersion must be >= 1");
  }
  for (const c of contract.constraints) {
    const keywords = KNOWN_CONSTRAINTS[c];
    if (!keywords) {
      issues.push(`unknown constraint "${c}" (not in the recognized vocabulary)`);
      continue;
    }
    const body = content.replace(/^---\n[\s\S]*?\n---/, "").toLowerCase();
    if (!keywords.some((k) => body.includes(k))) {
      issues.push(`constraint "${c}" is declared but the prompt body never references it`);
    }
  }
  return issues;
}
