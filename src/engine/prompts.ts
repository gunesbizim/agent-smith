// Phase prompt builders for the TDD engine.
//
// These are the default, stack-agnostic prompts. Stage 5 wires richer, template-resolved prompts
// (templates/prompts/tdd-*.md) and has the RED/CODE phases reference the scaffolded test-backend /
// test-frontend skills as the single source of truth for test authoring. The shapes returned here
// define the JSON contract every phase agent must honor.
function ticketSuffix(ticketId: string | null): string {
  return ticketId ? ` (${ticketId})` : "";
}

export interface TddPromptContext {
  ticketId: string | null;
  task: string;
  testCommand: string;
  scenarios?: string;
  testPlanJson?: string;
  redProofJson?: string;
  subtaskSummary?: string;
  targetTests?: string[];
}

export function understandPrompt(c: TddPromptContext): string {
  return [
    `You are the planning agent for a TDD-first workflow. Task${ticketSuffix(c.ticketId)}: ${c.task}`,
    "",
    "Produce BOTH manual + automation test scenarios AND a unit/feature test plan grounded in the real repo.",
    "Read the codebase first. Reference real files/symbols.",
    "",
    "Return ONLY a JSON object:",
    '{ "scenarios": "<markdown: manual + automation scenarios>",',
    '  "testPlan": { "unit": [ { "id": "<stable test id>", "file": "<path>", "description": "..." } ],',
    '               "feature": [ { "id": "<stable test id>", "file": "<path>", "description": "..." } ] } }',
    "Every id MUST be the exact name the test runner will print (e.g. pytest nodeid or vitest test title).",
  ].join("\n");
}

export function redPrompt(c: TddPromptContext): string {
  return [
    "You are the RED-phase agent. Write ONLY the tests from this test plan — do NOT implement any feature.",
    "Follow the project's scaffolded test-backend / test-frontend skill conventions.",
    "",
    `Test plan:\n${c.testPlanJson ?? "{}"}`,
    "",
    "Write each test so it FAILS against the current (unimplemented) code by asserting the intended behaviour.",
    "Do not write tests that merely import or that trivially pass. After writing, stop — the engine runs the suite.",
    "Return ONLY a JSON object: { \"filesWritten\": [\"<path>\", ...] }",
  ].join("\n");
}

export function planPrompt(c: TddPromptContext): string {
  return [
    "You are the planning agent. Decompose the implementation into the smallest sensible subtasks so that,",
    "executed in order, they turn every failing test green. Each subtask runs in a fresh agent.",
    "",
    `Failing tests (red proof):\n${c.redProofJson ?? "{}"}`,
    `Scenarios:\n${c.scenarios ?? ""}`,
    "",
    "Return ONLY a JSON object:",
    '{ "subtasks": [ { "key": "T1", "summary": "...", "files": ["<path>"], "targetTests": ["<test id>", ...] } ] }',
    "Every failing test id MUST appear in at least one subtask’s targetTests.",
  ].join("\n");
}

export function codePrompt(c: TddPromptContext): string {
  return [
    "You are the coding agent for ONE subtask in a TDD workflow. Implement ONLY this subtask.",
    `Subtask: ${c.subtaskSummary ?? ""}`,
    `It must make these tests pass: ${(c.targetTests ?? []).join(", ")}`,
    "",
    "Do not modify the tests. Do not implement other subtasks. Make the minimal change that turns the",
    "targeted tests green without regressing any currently-passing test.",
    "Return ONLY a JSON object: { \"filesChanged\": [\"<path>\", ...], \"notes\": \"...\" }",
  ].join("\n");
}

export function reviewPrompt(c: TddPromptContext): string {
  return [
    "You are the review agent. The full test suite is green. Review the diff for correctness, security,",
    "and architecture. Note any blocker. The architectural quality gate (sentrux) runs separately and",
    "must not degrade. Return ONLY a JSON object: { \"verdict\": \"approve\"|\"changes\", \"findings\": [\"...\"] }",
  ].join("\n");
}
