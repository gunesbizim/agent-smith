// Type declarations for the user-prompt-handoff-nudge hook's pure helpers (tested from src/).
export function estimateContextTokens(transcriptText: string): number;
export function decideNudge(args: {
  tokens: number;
  windowSize: number;
  threshold: number;
  alreadyNudged: boolean;
}): { nudge: boolean; pct: number };
export function nudgeMessage(pct: number): string;
