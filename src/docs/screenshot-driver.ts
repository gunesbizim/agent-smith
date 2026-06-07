// Playwright screenshot driver — captures UI screenshots per role
export interface ScreenshotJob {
  flow: string;
  role: string;
  step: number;
  route: string;
  actions: ScreenshotAction[];
  filename: string;
}

export type ScreenshotAction =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string }
  | { type: "type"; selector: string; text: string }
  | { type: "wait"; ms: number }
  | { type: "screenshot" }
  | { type: "snapshot" };

export function planScreenshots(
  flows: string[],
  roles: string[],
  baseUrl: string,
): ScreenshotJob[] {
  const jobs: ScreenshotJob[] = [];

  for (const flow of flows) {
    for (const role of roles) {
      jobs.push({
        flow,
        role,
        step: 1,
        route: `${baseUrl}/${flow}`,
        actions: [
          { type: "navigate", url: `${baseUrl}/${flow}` },
          { type: "wait", ms: 1000 },
          { type: "snapshot" },
          { type: "screenshot" },
        ],
        filename: `docs/screenshots/${flow}-${role}-01-entry.png`,
      });
    }
  }

  return jobs;
}

export async function executeScreenshots(jobs: ScreenshotJob[]): Promise<string[]> {
  // In production, this calls the Playwright MCP to execute each job
  return jobs.map((j) => j.filename);
}
