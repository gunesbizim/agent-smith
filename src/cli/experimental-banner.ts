// B9 — truth-in-advertising for the legacy preview commands.
// `ticket`/`pipeline` still use the stub `runPipeline`/`executePhase` (hardcoded success): they
// print the planned phase sequence but do NOT execute it. The real, human-gated execution engine
// shipped (roadmap A1) as `agent-smith run`, so this banner directs users there and never implies
// a PR was created when none was.
import chalk from "chalk";

export const EXPERIMENTAL_BANNER_TEXT =
  "Preview only: this prints the planned phases but does not execute them. " +
  "For real, human-gated execution use `agent-smith run`.";

export function printExperimentalBanner(): void {
  console.log(chalk.yellow.bold("⚠ " + EXPERIMENTAL_BANNER_TEXT));
}
