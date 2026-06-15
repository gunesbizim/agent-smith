// Type declarations for the stop-change-detector hook's pure helpers (tested from src/).
export interface FileClassification {
  kind: "code" | "docs" | "other";
  side?: "backend" | "frontend" | "other";
}

export interface ChangeReport {
  timestamp: string;
  projectRoot: string;
  hasUncommittedChanges: boolean;
  sourceDirs: string[];
  changedCodeFiles: string[];
  changedBackendFiles: string[];
  changedFrontendFiles: string[];
  changedDocsFiles: string[];
  suggestions: string[];
}

export function classifyFile(file: string, sourceDirs?: string[]): FileClassification;
export function buildReport(changedFiles: string[], sourceDirs: string[], projectRoot: string): ChangeReport;
export function resolveSourceDirs(projectRoot: string): string[];
