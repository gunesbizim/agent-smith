// pipeline command — run pipeline on current branch
import chalk from "chalk";
import ora from "ora";
import { printExperimentalBanner } from "./experimental-banner.js";

interface PipelineOptions {
  auto?: boolean;
  from?: string;
}

export async function pipelineCommand(_opts: PipelineOptions): Promise<void> {
  console.log(chalk.bold.cyan("\n⚒ Agent Smith — Pipeline\n"));
  printExperimentalBanner();

  const spinner = ora("Previewing pipeline phases...").start();
  spinner.info("Pipeline engine not yet wired (roadmap A1)");
  spinner.succeed("Planned phases: Plan → Implement → Test → Review → Document → PR");

  console.log("");
}
