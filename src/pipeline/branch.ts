// Pure branch-decision helper — no git side effects, no execSync.

export type BranchAction = "reuse" | "create";

export interface DecideBranchInput {
  currentBranch: string;        // e.g. "main", "feat/ABC-1-foo"
  continueHint?: string;        // from $ARGUMENTS: a ticket id or branch name, may be ""/undefined
  proposedName?: string;        // desired new branch name when creating
  defaultBranches?: string[];   // defaults to ["main", "master"]
  defaultBase?: string;         // base to fork from, defaults to "main"
}

export interface BranchDecision {
  action: BranchAction;
  branchName: string;           // current branch when reuse; proposedName when create
  baseRef: string;              // e.g. "origin/main" when create; "" when reuse
  reason: string;               // short human explanation
  steps: string[];              // ordered git commands to realize the decision
}

// Returns true when hint is non-empty and branch (lowercased) includes hint (lowercased, trimmed).
function matchesHint(branch: string, hint: string | undefined): boolean {
  if (!hint || hint.trim() === "") return false;
  return branch.toLowerCase().includes(hint.toLowerCase().trim());
}

// Derives a branch name from a hint by replacing runs of non-alphanumeric chars with "-".
function deriveNameFromHint(hint: string): string {
  return hint.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function decideBranch(input: DecideBranchInput): BranchDecision {
  const {
    currentBranch,
    continueHint,
    proposedName,
    defaultBranches = ["main", "master"],
    defaultBase = "main",
  } = input;

  const base = defaultBase;
  const baseRef = "origin/" + base;
  const onDefault = defaultBranches.includes(currentBranch);

  // ------------------------------------------------------------------
  // Case 1: currently on a default branch → always create
  // ------------------------------------------------------------------
  if (onDefault) {
    const branchName = proposedName || "";
    const switchTarget = branchName || "<branch-name>";
    const noName = !branchName;

    return {
      action: "create",
      branchName,
      baseRef,
      reason: noName
        ? `On default branch '${currentBranch}'; a branch name is required to proceed.`
        : `On default branch '${currentBranch}'; creating new branch '${branchName}' from ${baseRef}.`,
      steps: [
        "git fetch origin",
        `git switch -c ${switchTarget} ${baseRef}`,
      ],
    };
  }

  // ------------------------------------------------------------------
  // Case 2: on a feature branch
  // ------------------------------------------------------------------

  const hintProvided = typeof continueHint === "string" && continueHint.trim() !== "";

  // 2a: hint is provided but does NOT match the current branch → switch issue → create
  if (hintProvided && !matchesHint(currentBranch, continueHint)) {
    const derived = deriveNameFromHint(continueHint.trim());
    const branchName = proposedName || derived;

    return {
      action: "create",
      branchName,
      baseRef,
      reason: `Hint '${continueHint}' does not match current branch '${currentBranch}'; creating new branch '${branchName}' from ${baseRef}.`,
      steps: [
        "git fetch origin",
        `git switch -c ${branchName} ${baseRef}`,
      ],
    };
  }

  // 2b: no hint, or hint matches current branch → reuse
  return {
    action: "reuse",
    branchName: currentBranch,
    baseRef: "",
    reason: `Continuing existing work on branch '${currentBranch}'.`,
    steps: ["git fetch origin"],
  };
}
