// Type declarations for the session-start-dashboard hook's pure helpers (tested from src/).
export function isDisabled(env: Record<string, string | undefined>): boolean;
export function shouldOpenBrowser(env: Record<string, string | undefined>): boolean;
export function parsePort(env: Record<string, string | undefined>): number;
export function resolveDashboardCommand(
  hookDir: string,
  env: Record<string, string | undefined>,
  existsSync?: (p: string) => boolean,
): { cmd: string; args: string[] };
