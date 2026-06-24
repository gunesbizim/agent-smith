// Human-approval gates for the runtime engine.
//
// Honors the existing ApprovalGate vocabulary ("none" | "plan" | "all") for real — unlike the old
// stub which auto-approved everything. In a non-interactive context (CI, no TTY) a required pause
// becomes a clean "paused" run that can be resumed later, never a silent auto-approve. This keeps the
// "semi-autonomous / human-gated" guarantee.
import type { ApprovalGate } from "../shared/types.js";

/**
 * Should the engine pause BEFORE running `phase`?
 *  - none → never.
 *  - all  → before every phase.
 *  - plan → before the CODE phase, i.e. after UNDERSTAND + RED + PLAN, so a human can review the
 *           scenarios, the failing tests, and the subtask plan before any implementation begins.
 */
export function shouldPause(phase: string, gate: ApprovalGate): boolean {
  if (gate === "none") return false;
  if (gate === "all") return true;
  if (gate === "plan") return phase === "code";
  return false;
}

export type ConfirmFn = (phase: string) => Promise<boolean>;

/** Prompt in a TTY via inquirer; otherwise return false (pause) — never auto-approve unattended. */
export async function defaultConfirm(phase: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const inquirer = (await import("inquirer")).default;
  const { ok } = await inquirer.prompt([
    { type: "confirm", name: "ok", message: `Phase "${phase}" ready — review and proceed?`, default: true },
  ]);
  return ok === true;
}
