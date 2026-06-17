// Skills report renderer (P4). Turns the parsed + cross-checked SkillsReport into a boxed
// terminal summary so the user sees exactly which skills were authored, the stack they were
// grounded in, and how many recommended practices each surfaced.
import chalk from "chalk";
import type { SkillsReport } from "../adapt/llm-skills.js";

export function renderSkillsReport(report: SkillsReport): void {
  const lines: string[] = [];
  lines.push(chalk.bold.cyan("\n  Skills report"));
  lines.push(chalk.gray(`  Stack grounded in: ${report.stack}`));
  if (report.bestPracticesDoc) {
    lines.push(chalk.gray(`  Best-practices doc: ${report.bestPracticesDoc}`));
  }
  lines.push("");

  let rewritten = 0;
  let practices = 0;
  for (const s of report.skills) {
    const mark = s.rewritten ? chalk.green("✓") : chalk.red("✗");
    const count = chalk.gray(`(${s.recommendedPractices} recommended)`);
    lines.push(`  ${mark} ${chalk.white(s.name)} ${count}`);
    if (s.rewritten) rewritten++;
    practices += s.recommendedPractices;
  }

  lines.push("");
  lines.push(chalk.gray(`  ${rewritten}/${report.skills.length} skills rewritten · ${practices} recommended practices surfaced`));
  if (report.notes) {
    lines.push(chalk.gray(`  Notes: ${report.notes}`));
  }

  console.log(lines.join("\n"));
}
