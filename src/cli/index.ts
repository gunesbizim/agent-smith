// CLI entry point — registered via Commander
import { Command } from "commander";
import chalk from "chalk";

const program = new Command();

program
  .name("agent-smith")
  .description("Autonomous development pipeline — MCP auto-config, project-aware skills, Jira-to-PR automation")
  .version("0.1.0");

// ------ init ------
program
  .command("init")
  .description("Full setup: detect project → scaffold skills → install MCPs → customize")
  .option("--platform <platform>", "Target platform", "claude-code")
  .option("--auto", "Skip interactive prompts")
  .option("--dry-run", "Show what would be done without doing it")
  .option("--dir <dir>", "Target project directory")
  .option("--caveman", "Compress generated skills with caveman (~75% token savings)")
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
  .action(async (opts) => {
    const { configureCommand } = await import("./configure.js");
    await configureCommand(opts);
  });

// ------ analyze ------
program
  .command("analyze")
  .description("Detect tech stack and print report")
  .option("--json", "Output as JSON")
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

// ------ ticket ------
program
  .command("ticket <ticketId>")
  .description("Fetch Jira ticket and run autonomous pipeline")
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
  .description("Run full pipeline on current branch changes")
  .option("--auto", "Full autonomous — no human approval gates")
  .option("--from <phase>", "Resume from a specific phase")
  .action(async (opts) => {
    const { pipelineCommand } = await import("./pipeline.js");
    await pipelineCommand(opts);
  });

export async function run(argv: string[]) {
  try {
    await program.parseAsync(argv);
  } catch (err) {
    console.error(chalk.red("Fatal error:"), err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
