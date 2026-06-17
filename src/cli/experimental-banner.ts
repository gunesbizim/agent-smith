// B9 — truth-in-advertising for the not-yet-wired orchestration commands.
// `runPipeline`/`executePhase` currently return hardcoded success; until the real
// execution engine lands (roadmap A1) these commands print a planned phase sequence
// but do NOT execute it. This banner says so loudly so the CLI never implies a PR
// was created when none was.
import chalk from "chalk";

export const EXPERIMENTAL_BANNER_TEXT =
  "Experimental: this prints a planned phase sequence but does not yet execute it (roadmap A1).";

export function printExperimentalBanner(): void {
  console.log(chalk.yellow.bold("⚠ " + EXPERIMENTAL_BANNER_TEXT));
}
