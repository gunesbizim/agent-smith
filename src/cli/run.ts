// `agent-smith run <ticket|task>` — drive the TDD-first runtime engine.
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import ora from "ora";
import fs from "fs-extra";
import type { ApprovalGate } from "../shared/types.js";
import { fetchJiraTicket, looksLikeTicketId, mapWorkflowToBranch } from "../jira/ticket-parser.js";
import { isClaudeAvailable } from "../analyze/claude-runner.js";
import { runEngine } from "../engine/tdd-engine.js";

interface RunOptions {
  auto?: boolean;
  approvePlan?: boolean;
  approveAll?: boolean;
  resume?: string;
  modelPlan?: string;
  modelCode?: string;
  dir?: string;
  testCmd?: string;
}

export async function runCommand(input: string, opts: RunOptions): Promise<void> {
  const root = path.resolve(opts.dir ?? process.cwd());
  let approvalGate: ApprovalGate;
  if (opts.auto) {
    approvalGate = "none";
  } else if (opts.approveAll) {
    approvalGate = "all";
  } else {
    approvalGate = "plan";
  }

  console.log(chalk.bold.cyan(`\n⚒ Agent Smith — TDD engine\n`));

  // Preflight: the engine drives the `claude` CLI; without it every phase fails opaquely.
  if (!isClaudeAvailable()) {
    console.error(chalk.red("✗ The `claude` CLI was not found on PATH. Install it (and check `claude --version`) before running the engine."));
    process.exitCode = 1;
    return;
  }

  const { ticketId, task, branch } = await resolveInput(input, root);
  const testCommand = resolveTestCommand(root, opts);

  if (testCommand === "none") {
    console.log(
      chalk.yellow.bold("⚠ No test command found — the RED gate is DISABLED, so this run is NOT test-driven.") +
        chalk.yellow("\n  Pass --test-cmd <cmd> or set testCommand in .claude/agent-smith/config.json to enable TDD.\n"),
    );
  }

  console.log(chalk.gray("  Phases: ") + chalk.white("understand → red → plan → code → review → pr"));
  console.log(chalk.gray("  Models: ") + chalk.white(`${opts.modelPlan ?? "opus"} (plan/think) · ${opts.modelCode ?? "sonnet"} (code)`));
  console.log(chalk.gray(`  Approval gate: ${approvalGate}   Test command: ${testCommand}\n`));

  const result = await runEngine(
    {
      ticketId,
      task,
      branch,
      approvalGate,
      testCommand,
      testCwd: root,
      mcpConfigPath: path.join(root, ".mcp.json"),
      planModel: opts.modelPlan,
      codeModel: opts.modelCode,
      engineVersion: readVersion(),
    },
    { root, runId: opts.resume },
  );

  const s = result.state;
  let line: string;
  if (s.status === "completed") {
    line = chalk.green("✓ Run completed");
  } else if (s.status === "paused") {
    line = chalk.yellow("⏸ Run paused (approval gate) — resume with --resume " + result.runId);
  } else {
    line = chalk.red("✗ Run " + s.status);
  }
  console.log(`\n${line}`);
  console.log(chalk.gray(`  run id: ${result.runId}`));
  console.log(chalk.gray(`  phases done: ${s.phasesCompleted.join(", ") || "(none)"}`));
  console.log(chalk.gray(`  watch live:  agent-smith dashboard --run ${result.runId}\n`));
}

async function resolveInput(input: string, root: string): Promise<{ ticketId: string | null; task: string; branch: string }> {
  if (!looksLikeTicketId(input)) {
    return { ticketId: null, task: input, branch: deriveBranch(input) };
  }
  const ticketId = input.trim();
  const spinner = ora(`Fetching ${ticketId} from Jira (Atlassian MCP)...`).start();
  const ticket = fetchJiraTicket(ticketId, root);
  if (ticket) {
    spinner.succeed(`Fetched ${ticketId}: ${ticket.summary}`);
    const ac = ticket.acceptanceCriteria.length ? `\n\nAcceptance criteria:\n- ${ticket.acceptanceCriteria.join("\n- ")}` : "";
    return { ticketId, task: `${ticket.summary}\n\n${ticket.description}${ac}`, branch: mapWorkflowToBranch(ticket).branchName };
  }
  spinner.warn(`Jira unreachable for ${ticketId} — the understand phase will fetch details if it can.`);
  return { ticketId, task: `Implement Jira ticket ${ticketId}.`, branch: `feat/${ticketId.toLowerCase()}` };
}

function deriveBranch(task: string): string {
  // Collapse each run of non-alphanumerics to a single "-", so the result can have at most one
  // leading and one trailing "-". Trim those with plain string ops — no regex quantifier, hence
  // no super-linear backtracking for SonarCloud S8786 to flag.
  let slug = task.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (slug.startsWith("-")) slug = slug.slice(1);
  if (slug.endsWith("-")) slug = slug.slice(0, -1);
  slug = slug.slice(0, 40) || "task";
  return `feat/${slug}`;
}

// Resolve the test command: explicit flag > .claude/agent-smith/config.json > "none" (RED gate skipped).
function resolveTestCommand(root: string, opts: RunOptions): string {
  if (opts.testCmd) return opts.testCmd;
  try {
    const cfg = fs.readJsonSync(path.join(root, ".claude", "agent-smith", "config.json")) as Record<string, unknown>;
    const cmd = cfg.testCommand ?? cfg.backendTestCommand;
    if (typeof cmd === "string" && cmd.trim()) return cmd;
  } catch {
    /* no config — fall through */
  }
  return "none";
}

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../package.json"), "utf-8"));
    return String(pkg.version ?? "0.0.0");
  } catch {
    return "0.0.0";
  }
}
