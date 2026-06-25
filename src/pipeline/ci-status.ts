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
  pending: CiCheck[];        // bucket "pending" or any bucket not in the green allowlist {"pass","skipping"}
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

  return parsed.map((e: unknown) => {
    if (e === null || typeof e !== "object" || Array.isArray(e)) {
      throw new Error("Expected each check to be an object");
    }
    const obj = e as Record<string, unknown>;
    const check: CiCheck = {
      name: String(obj.name ?? ""),
      bucket: String(obj.bucket ?? ""),
    };
    if (obj.state !== undefined) check.state = String(obj.state);
    if (obj.link !== undefined) check.link = String(obj.link);
    if (obj.workflow !== undefined) check.workflow = String(obj.workflow);
    return check;
  });
}

const GREEN_ALLOWLIST = new Set(["pass", "skipping"]);

// Evaluate normalized checks into an overall status.
// Allowlist model: green requires checks.length > 0 AND every bucket in {"pass","skipping"}.
// Unknown/empty buckets count as pending, not green.
// Empty array → pending (checks haven't registered yet).
export function evaluateCi(checks: CiCheck[]): CiEvaluation {
  const failed = checks.filter(
    (c) => c.bucket === "fail" || c.bucket === "cancel",
  );
  // pending = explicit "pending" bucket OR any bucket not in green allowlist and not failed
  const pending = checks.filter(
    (c) => c.bucket !== "fail" && c.bucket !== "cancel" && !GREEN_ALLOWLIST.has(c.bucket),
  );

  let status: CiStatus;
  if (failed.length > 0) {
    status = "failed";
  } else if (checks.length === 0 || pending.length > 0) {
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
