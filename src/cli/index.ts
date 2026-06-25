// CLI entry point — registered via Commander
import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Read the real version from package.json at runtime (ESM-safe).
// Compiled output lives at dist/cli/index.js, so package.json is two levels up.
const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../package.json"), "utf-8"),
);

const HELP_AFTER = `
Command groups:
  Setup:    init        Full setup — detect, scaffold skills, install MCPs
            configure   Re-run MCP configuration only
  Inspect:  analyze     Detect tech stack and print report
            doctor      Health check: MCPs, skills, git state
            confirm     Settle ground-truth values for future runs
  Execute:  run         TDD-first engine on a ticket id or free-text task
            ticket      Preview planned phases for a Jira ticket (no execution)
            pipeline    Preview planned phases for current changes (no execution)
  Track:    dashboard   Local web UI for all agent calls across runs

Examples:
  agent-smith init --yes
  agent-smith analyze --json
  agent-smith doctor
  agent-smith run "add a /health endpoint"
  agent-smith ticket PROJ-123 --approve-plan
  agent-smith dashboard
`;

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("agent-smith")
    .description("Autonomous development pipeline — MCP auto-config, project-aware skills, Jira-to-PR automation")
    .version(pkg.version)
    .showHelpAfterError("(run `agent-smith --help` to see all commands)")
    .addHelpText("after", HELP_AFTER)
    .action(() => {
      program.outputHelp();
    });

  // ------ init ------
  program
    .command("init")
    .description("Full setup: detect project → scaffold skills → install MCPs → customize")
    .option("--platform <platform>", "Target platform", "claude-code")
    .option("--auto", "Skip interactive prompts")
    .option("--dry-run", "Show what would be done without doing it")
    .option("--dir <dir>", "Target project directory")
    .option("--caveman", "Compress generated skills with caveman (~75% token savings)")
    .option("--no-interview", "Skip the interactive project conventions interview")
    .option("--no-llm", "Disable LLM generation; use fast template/heuristic path only (LLM is on by default when the `claude` CLI is present)")
    .option("--yes", "Approve MCP installation without prompting")
    .option("--no-install", "Skip installing MCP server binaries (config files are still written)")
    .option("--regen-skills", "Re-run LLM skill generation even if it already ran for this repo")
    .action(async (opts) => {
      const { initCommand } = await import("./init.js");
      await initCommand(opts);
    });

  // ------ configure ------
  program
    .command("configure")
    .description("Re-run MCP configuration only")
    .option("--mcp <servers>", "Comma-separated list of MCPs to configure")
    .option("--scope <scope>", "Config scope: project, user, or all", "all")
    .option("--yes", "Approve MCP installation without prompting")
    .option("--no-install", "Skip installing MCP server binaries (config files are still written)")
    .action(async (opts) => {
      const { configureCommand } = await import("./configure.js");
      await configureCommand(opts);
    });

  // ------ analyze ------
  program
    .command("analyze")
    .description("Detect tech stack and print report")
    .option("--json", "Output as JSON")
    .option("--llm", "Refine stack detection with a headless Claude pass (requires `claude` on PATH)")
    .action(async (opts) => {
      const { analyzeCommand } = await import("./analyze.js");
      await analyzeCommand(opts);
    });

  // ------ doctor ------
  program
    .command("doctor")
    .description("Health check: MCP connections, skill validity, git state")
    .action(async () => {
      const { doctorCommand } = await import("./doctor.js");
      await doctorCommand();
    });

  // ------ confirm ------
  program
    .command("confirm [pairs...]")
    .description("Settle ground-truth values (key=value …) the next run reads first; --list to view")
    .option("--dir <dir>", "Target project directory")
    .option("--list", "List the currently-confirmed values instead of writing")
    .action(async (pairs, opts) => {
      const { confirmCommand } = await import("./confirm.js");
      await confirmCommand(pairs ?? [], opts);
    });

  // ------ ticket ------
  program
    .command("ticket <ticketId>")
    .description("Preview the planned phases for a Jira ticket (does not execute — use `agent-smith run` for real execution)")
    .option("--auto", "Full autonomous — no human approval gates")
    .option("--approve-plan", "Pause after planning phase")
    .option("--approve-all", "Pause after each phase")
    .action(async (ticketId, opts) => {
      const { ticketCommand } = await import("./ticket.js");
      await ticketCommand(ticketId, opts);
    });

  // ------ pipeline ------
  program
    .command("pipeline")
    .description("Preview the planned phases for current changes (does not execute — use `agent-smith run` for real execution)")
    .option("--auto", "Full autonomous — no human approval gates")
    .option("--from <phase>", "Resume from a specific phase")
    .action(async (opts) => {
      const { pipelineCommand } = await import("./pipeline.js");
      await pipelineCommand(opts);
    });

  // ------ run ------
  program
    .command("run <input>")
    .description("Run the TDD-first engine on a Jira ticket id or a free-text task (understand→red→plan→code→review→pr)")
    .option("--auto", "Full autonomous — no human approval gates")
    .option("--approve-plan", "Pause after planning, before implementation (default)")
    .option("--approve-all", "Pause before every phase")
    .option("--resume <runId>", "Resume an interrupted run")
    .option("--model-plan <model>", "Model for planning/thinking", "opus")
    .option("--model-code <model>", "Model for coding", "sonnet")
    .option("--test-cmd <command>", "Test command for the RED/green gate (overrides config)")
    .option("--dir <dir>", "Target project directory")
    .action(async (input, opts) => {
      const { runCommand } = await import("./run.js");
      await runCommand(input, opts);
    });

  // ------ dashboard ------
  program
    .command("dashboard")
    .description("Local web UI tracking all agent calls across engine runs and interactive sessions")
    .option("--port <port>", "Port to listen on (falls back to a free port if taken)", "4575")
    .option("--run <id>", "Scope the dashboard to a single run id")
    .option("--dir <dir>", "Project directory containing .agent-smith/runs", process.cwd())
    .option("--no-open", "Do not auto-open the browser")
    .action(async (opts) => {
      const { dashboardCommand } = await import("./dashboard.js");
      await dashboardCommand(opts);
    });

  return program;
}

export async function run(argv: string[]) {
  try {
    await buildProgram().parseAsync(argv);
  } catch (err) {
    console.error(chalk.red("Fatal error:"), err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
