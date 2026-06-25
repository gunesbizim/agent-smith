// Pure CI-status evaluator — no I/O, no execSync (parsing + evaluation only).

export interface CiCheck {
  name: string;
  bucket: string;            // "pass" | "fail" | "pending" | "skipping" | "cancel" | (other)
  state?: string;
  link?: string;
  workflow?: string;
}

export type CiStatus = "green" | "pending" | "failed";

export interface CiEvaluation {
  status: CiStatus;
  failed: CiCheck[];         // bucket "fail" or "cancel"
  pending: CiCheck[];        // bucket "pending"
  sonar: { present: boolean; green: boolean | null };  // checks whose name/workflow matches /sonar/i
}

// Parse gh JSON. "" or "[]" → []. Invalid JSON → throw Error. Non-array → throw Error.
export function parseGhChecks(json: string): CiCheck[] {
  const trimmed = json.trim();
  if (trimmed === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error("Invalid gh checks JSON: " + msg);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Expected a JSON array of checks");
  }

  return parsed.map((e: Record<string, unknown>) => {
    const check: CiCheck = {
      name: String(e.name ?? ""),
      bucket: String(e.bucket ?? ""),
    };
    if (e.state !== undefined) check.state = String(e.state);
    if (e.link !== undefined) check.link = String(e.link);
    if (e.workflow !== undefined) check.workflow = String(e.workflow);
    return check;
  });
}

// Evaluate normalized checks into an overall status.
export function evaluateCi(checks: CiCheck[]): CiEvaluation {
  const failed = checks.filter(
    (c) => c.bucket === "fail" || c.bucket === "cancel",
  );
  const pending = checks.filter((c) => c.bucket === "pending");

  let status: CiStatus;
  if (failed.length > 0) {
    status = "failed";
  } else if (pending.length > 0) {
    status = "pending";
  } else {
    status = "green";
  }

  const sonarChecks = checks.filter(
    (c) => /sonar/i.test(c.name) || (c.workflow !== undefined && /sonar/i.test(c.workflow)),
  );
  const sonarPresent = sonarChecks.length > 0;
  let sonarGreen: boolean | null = null;
  if (sonarPresent) {
    const sonarFailed = sonarChecks.some(
      (c) => c.bucket === "fail" || c.bucket === "cancel" || c.bucket === "pending",
    );
    sonarGreen = !sonarFailed;
  }

  return {
    status,
    failed,
    pending,
    sonar: { present: sonarPresent, green: sonarGreen },
  };
}
