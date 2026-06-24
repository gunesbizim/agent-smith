// Type declarations for the pre-tool-tdd-gate hook's pure helpers (tested from src/).
export interface RedProofLike {
  newTests?: Array<{ id: string; status?: string }>;
}

export interface GreenProofLike {
  fingerprint?: string;
  passing?: string[];
}

export interface GateDecision {
  decision: "allow" | "deny";
  reason: string | null;
}

export function isGatedCommand(command: string): boolean;
export function decideTddGate(args: {
  redProof: RedProofLike | null;
  greenProof?: GreenProofLike | null;
  fingerprint?: string;
}): GateDecision;
export function treeFingerprint(cwd: string): string;
