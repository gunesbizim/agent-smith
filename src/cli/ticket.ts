// ticket command — Jira ticket → autonomous pipeline
import chalk from "chalk";
import ora from "ora";
import type { ApprovalGate } from "../shared/types.js";

interface TicketOptions {
  auto?: boolean;
  approvePlan?: boolean;
  approveAll?: boolean;
}

export async function ticketCommand(ticketId: string, opts: TicketOptions): Promise<void> {
  console.log(chalk.bold.cyan(`\n⚒ Agent Smith — Ticket: ${ticketId}\n`));

  const approvalGate: ApprovalGate = opts.auto ? "none" : opts.approveAll ? "all" : opts.approvePlan ? "plan" : "plan";

  const spinner = ora(`Fetching ${ticketId} from Jira...`).start();

  // TODO: Actual Jira MCP integration (M5)
  // For now, emit the structured plan
  spinner.info("Jira MCP integration pending (Milestone 5)");
  spinner.succeed("Ticket structure ready");

  console.log(chalk.gray("\nPipeline will execute:"));
  console.log(chalk.white("  Plan → Implement → Test → Review → Document → PR\n"));
  console.log(chalk.yellow(`  Approval gate: ${approvalGate}`));
  console.log(chalk.gray(`  Branch: ${ticketId.toLowerCase()}-auto\n`));

  // Placeholder for M6 autonomous pipeline
  console.log(chalk.gray("Autonomous pipeline engine — Milestone 6"));
  console.log("");
}
