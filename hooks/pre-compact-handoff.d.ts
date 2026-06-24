// Type declarations for the pre-compact-handoff hook's pure helpers (tested from src/).
export const SNAPSHOT_FILENAME: string;

export interface SnapshotFacts {
  branch?: string;
  status?: string;
  recentCommits?: string;
  openPr?: string;
  timestamp?: string;
}

export function renderSnapshot(facts?: SnapshotFacts): string;
