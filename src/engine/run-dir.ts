// Run-directory layout helpers for the runtime engine.
//
// Everything a run produces lives under `<root>/.agent-smith/runs/<runId>/`. This dir is transient
// (gitignored in target repos); `events.jsonl` is the source of truth and the rest is derived.
import path from "node:path";

export function agentSmithDir(root: string): string {
  return path.join(root, ".agent-smith");
}

export function runsDir(root: string): string {
  return path.join(agentSmithDir(root), "runs");
}

export function runDir(root: string, runId: string): string {
  return path.join(runsDir(root), runId);
}

export function eventsPath(root: string, runId: string): string {
  return path.join(runDir(root, runId), "events.jsonl");
}

export function runJsonPath(root: string, runId: string): string {
  return path.join(runDir(root, runId), "run.json");
}

export function artifactsDir(root: string, runId: string): string {
  return path.join(runDir(root, runId), "artifacts");
}

/** Pointer file naming the active run id — read by the deterministic TDD-gate hook. */
export function currentPointerPath(root: string): string {
  return path.join(runsDir(root), "current");
}

/** Path to a named artifact at the run root (e.g. "scenarios.md", "red-proof.json"). */
export function artifactPath(root: string, runId: string, name: string): string {
  return path.join(runDir(root, runId), name);
}

/**
 * Build a stable, filesystem-safe run id from a seed (ticket id or task text) and a timestamp.
 * `now` and `rand` are injectable so tests are deterministic. Shape: `<slug>-<YYYYMMDDTHHMMSS>-<rand>`.
 */
export function makeRunId(seed: string, now: Date, rand?: () => string): string {
  const ts = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const slug =
    seed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "run";
  const suffix = rand ? rand() : Math.random().toString(36).slice(2, 8); // NOSONAR — id suffix, not security-sensitive
  return `${slug}-${ts}-${suffix}`;
}
