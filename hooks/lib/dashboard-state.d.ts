// Type declarations for the shared dashboard lifecycle state helpers (tested from src/).
export interface SessionEntry {
  id: string;
  ppid?: number | null;
}
export interface DashboardState {
  pid: number | null;
  port: number;
  autostarted: boolean;
  sessions: SessionEntry[];
}

export const STATE_DIR: string;
export const STATE_FILE: string;
export function stateFilePath(cwd: string): string;

export function addSession(sessions: SessionEntry[] | undefined, id: string, ppid?: number | null): SessionEntry[];
export function removeSession(sessions: SessionEntry[] | undefined, id: string): SessionEntry[];
export function pruneSessions(
  sessions: SessionEntry[] | undefined,
  isAlive: (pid: number) => boolean,
): SessionEntry[];
export function shouldStopDashboard(state: DashboardState | null, sessionId: string): boolean;

export function isProcessAlive(pid: number | null | undefined): boolean;
export function readState(cwd: string): DashboardState | null;
export function writeState(cwd: string, state: DashboardState): boolean;
export function deleteState(cwd: string): void;
