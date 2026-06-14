// Interactive project interview — asks user about conventions before generating skills.
// Smart defaults based on detection. User can answer, skip, or ask Claude to elaborate.
import chalk from "chalk";
import path from "node:path";
import fs from "fs-extra";
import readline from "node:readline";
import type { DetectedProject, TemplateVariables } from "../shared/types.js";

export interface InterviewAnswers {
  branchNaming: string;
  commitFormat: string;
  ticketPrefix: string;
  prChecklist: string[];
  testingRequirements: string[];
  architectureRules: string[];
  securityRequirements: string[];
  codeStyle: string[];
  customNotes: string;
  allowCycles: string;
  maxCC: string;
}

export interface InterviewQuestion {
  id: keyof InterviewAnswers;
  question: string;
  hint: string;
  defaultValue: string;
  /** Probe-derived default shown separately (optional) */
  probeDefault?: string;
  type: "text" | "multi" | "boolean";
  options?: string[];
}

function getDefaultTesting(hasFrontend: boolean, isCLI: boolean): string {
  if (hasFrontend) return "unit tests for new logic, role/permission tests, happy+error+edge paths, no empty test stubs";
  if (isCLI) return "unit tests for new logic, happy+error+edge paths, no empty test stubs";
  return "unit tests mandatory, integration tests marked separately, happy+error+edge+permission paths";
}

function getDefaultArchRules(hasBackend: boolean, isCLI: boolean): string {
  if (hasBackend) return "no ORM in views, services return data not HTTP, repository pattern for data access, absolute imports, structured logging with trace_id";
  if (isCLI) return "modular design, no circular imports, typed function signatures, error handling at boundaries";
  return "modular design, typed interfaces, error handling at boundaries, no circular imports";
}

export interface SentruxProbeDefaults {
  cycles: number | null;
  maxCC: number | null;
}

export function buildQuestions(project: DetectedProject, sentruxDefaults?: SentruxProbeDefaults): InterviewQuestion[] {
  const hasBackend = !!project.backend;
  const hasFrontend = !!project.frontend;
  const isCLI = project.projectType === "cli-tool";
  const isLibrary = project.projectType === "library";

  const defaultMaxCC = sentruxDefaults?.maxCC == null ? "25" : String(sentruxDefaults.maxCC);
  const cycleCount = sentruxDefaults?.cycles;
  const cyclePlural = cycleCount === 1 ? "cycle" : "cycles";
  const cyclesNote = cycleCount == null ? "" : ` (probe found ${cycleCount} ${cyclePlural})`;

  return [
    {
      id: "branchNaming",
      question: "Branch naming convention?",
      hint: "e.g. feature/XX-name, fix/XX-name, chore/XX-name — where XX is ticket number",
      defaultValue: "<type>/<ticket>-<short-description>",
      type: "text",
    },
    {
      id: "commitFormat",
      question: "Commit message format?",
      hint: "Conventional Commits: type(scope): TICKET-XX description",
      defaultValue: "type(scope): TICKET-XX description (≤72 chars)",
      type: "text",
    },
    {
      id: "ticketPrefix",
      question: "Ticket prefix (e.g. PROJ-, ACC-, JIRA-)?",
      hint: "Prefix used in branch names and commit messages",
      defaultValue: "PROJ-",
      type: "text",
    },
    {
      id: "prChecklist",
      question: "PR review requirements? (comma-separated)",
      hint: "e.g. tests pass, lint clean, 1+ approvals, no TODOs, docs updated",
      defaultValue: [
        "all tests pass",
        "lint + typecheck clean",
        "1+ reviewer approval",
        "docs updated if endpoints/views changed",
        "no commented-out code or TODO stubs",
      ].join(", "),
      type: "multi",
    },
    {
      id: "testingRequirements",
      question: "Testing requirements? (comma-separated)",
      hint: "e.g. unit tests mandatory, integration tests marked, coverage >80%, E2E for critical paths",
      defaultValue: getDefaultTesting(hasFrontend, isCLI),
      type: "multi",
    },
    {
      id: "architectureRules",
      question: "Architecture rules that are PR blockers? (comma-separated)",
      hint: "e.g. no ORM in views, services return data not Response, absolute imports only, PII must be encrypted",
      defaultValue: getDefaultArchRules(hasBackend, isCLI),
      type: "multi",
    },
    {
      id: "securityRequirements",
      question: "Security requirements? (comma-separated)",
      hint: "e.g. PII encrypted at rest, no secrets in code, auth on every endpoint, input validation everywhere",
      defaultValue: hasBackend
        ? "no secrets in code, auth on every endpoint, input validation, PII encrypted at rest"
        : "no secrets in code, input validation, no hardcoded credentials",
      type: "multi",
    },
    {
      id: "codeStyle",
      question: "Code style requirements? (comma-separated)",
      hint: "e.g. max line length 100, named exports preferred, explicit types, no any without annotation",
      defaultValue: isCLI || isLibrary
        ? "named exports, explicit types, no implicit any, max line length 100"
        : "named exports, explicit types, no implicit any, absolute imports only",
      type: "multi",
    },
    {
      id: "customNotes",
      question: "Any additional conventions, team rules, or architecture decisions to document?",
      hint: "Free text — these get added to docs/architecture/decisions.md and injected into skill context",
      defaultValue: "",
      type: "text",
    },
    {
      id: "allowCycles",
      question: `Allow dependency cycles?${cyclesNote} (yes/no)`,
      hint: "no = enforce zero cycles (fail on any new cycle). yes = ratchet mode (lock current count, block increases)",
      defaultValue: "no",
      type: "boolean",
    },
    {
      id: "maxCC",
      question: "Max cyclomatic complexity per function?",
      hint: "Functions above this threshold are flagged by sentrux. Lower = cleaner code. Recommended: 10-25",
      defaultValue: defaultMaxCC,
      probeDefault: defaultMaxCC,
      type: "text",
    },
  ];
}

export function smartDefaults(project: DetectedProject): Partial<InterviewAnswers> {
  const answers: Partial<InterviewAnswers> = {};
  const isCLI = project.projectType === "cli-tool";

  if (isCLI) {
    answers.branchNaming = "<type>/<ticket>-<short-description>";
    answers.commitFormat = "type(scope): TICKET-XX description";
    answers.ticketPrefix = "TICKET-";
  }

  answers.allowCycles = "no";
  answers.maxCC = "25";

  return answers;
}

export async function runInterview(
  projectRoot: string,
  project: DetectedProject,
  sentruxDefaults?: SentruxProbeDefaults,
): Promise<InterviewAnswers> {
  const questions = buildQuestions(project, sentruxDefaults);
  const defaults = smartDefaults(project);
  const answers: InterviewAnswers = {
    branchNaming: "",
    commitFormat: "",
    ticketPrefix: "PROJ-",
    prChecklist: [],
    testingRequirements: [],
    architectureRules: [],
    securityRequirements: [],
    codeStyle: [],
    customNotes: "",
    allowCycles: "no",
    maxCC: sentruxDefaults?.maxCC == null ? "25" : String(sentruxDefaults.maxCC),
  };

  console.log(chalk.bold.cyan("\n📋 Project Conventions Interview\n"));
  console.log(chalk.gray("  I'll ask about your project conventions. For each question you can:"));
  console.log(chalk.gray("  - Press Enter to accept the [default]"));
  console.log(chalk.gray("  - Type your answer"));
  console.log(chalk.gray("  - Type '?' to elaborate / ask Claude to explain"));
  console.log(chalk.gray("  - Type 'skip' to leave blank\n"));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  for (const q of questions) {
    const def: string = (defaults[q.id] ?? q.defaultValue) as string;

    console.log(chalk.white.bold(`\n${q.question}`));
    console.log(chalk.gray(`  Hint: ${q.hint}`));
    console.log(chalk.gray(`  [default: ${chalk.cyan(def || "none")}]`));

    let response = "";
    let answered = false;

    while (!answered) {
      response = (await ask(chalk.green("  > "))).trim();

      if (response === "" && def) {
        // Accept default
        response = def;
        console.log(chalk.gray(`  → Using default: ${chalk.cyan(response)}`));
        answered = true;
      } else if (response === "skip") {
        response = "";
        console.log(chalk.gray("  → Skipped"));
        answered = true;
      } else if (response === "?") {
        // User wants Claude to elaborate on this question
        console.log(chalk.yellow.bold(`\n  ── CLAUDE'S ELABORATION ──`));
        console.log(chalk.yellow(await elaborateQuestion(q)));
        console.log(chalk.yellow("  ─────────────────────────────\n"));
        console.log(chalk.gray("  Now enter your answer (or Enter for default, skip to leave blank):"));
      } else if (response.length > 0) {
        answered = true;
      } else {
        // Empty with no default — accept empty
        answered = true;
      }
    }

    // Store answer
    if (q.type === "multi") {
      const items = response
        ? response.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
      (answers as unknown as Record<string, unknown>)[q.id] = items;
    } else {
      (answers as unknown as Record<string, unknown>)[q.id] = response;
    }
  }

  rl.close();

  // Write decisions document
  await writeDecisionsDoc(projectRoot, answers, project);

  return answers;
}

async function elaborateQuestion(q: InterviewQuestion): Promise<string> {
  // Generate contextual elaboration for each question
  const elaborations: Record<string, string> = {
    branchNaming: `Branch naming keeps your git history organized. Common patterns:\n  • feature/ACC-42-user-login — feature branches with ticket ID\n  • fix/BUG-99-null-crash — bugfix branches\n  • chore/CI-update — maintenance work\n  • docs/API-reference — documentation only\n\nChoose a pattern your team agrees on. The ticket prefix makes branches searchable. Keep descriptions short (2-5 words).`,
    commitFormat: `Conventional Commits make changelogs automatable:\n  feat(scope): PROJ-42 add user authentication\n  fix(scope): PROJ-43 handle null input\n  docs(scope): PROJ-44 update API docs\n  test(scope): PROJ-45 add login tests\n  chore(scope): PROJ-46 bump dependencies\n\nScopes help filter changes (e.g. auth, ui, api, db, ci). Subject line ≤ 72 chars. Body only when "why" isn't obvious from the diff.`,
    ticketPrefix: `A short prefix that identifies your project's tickets. Examples:\n  • PROJ- → PROJ-42\n  • JIRA- → JIRA-1234\n  • ISSUE- → ISSUE-567\n  • FEAT- → FEAT-89\n\nThis prefix appears in branch names, commit messages, and PR titles. Keep it short (3-8 chars).`,
    prChecklist: `A checklist every PR must satisfy before merging. Common items:\n  • all tests pass (unit + integration)\n  • lint + typecheck clean\n  • 1+ reviewer approval\n  • docs updated if endpoints/views changed\n  • no commented-out code\n  • no TODO stubs without a tracking ticket\n  • migrations are reversible\n  • i18n keys added to all locale files\n\nPick what matters for your team. Too many = checklist fatigue. Too few = bugs in production.`,
    testingRequirements: `What must be tested before merging. Levels:\n  • Minimal: happy path + critical error paths\n  • Standard: happy + error + edge cases + permission boundaries\n  • Strict: above + integration + E2E for critical flows + coverage threshold\n\nFor backend: always test fail-closed (unauthenticated→401, wrong role→403).\nFor frontend: test role-gated rendering per role, i18n key assertions.`,
    architectureRules: `Non-negotiable patterns that block a PR. Examples:\n  • Layered: views→services→repositories (no ORM in views)\n  • Imports: absolute only, no circular imports\n  • Types: no implicit any, typed function signatures\n  • Logging: structured with trace_id, span_id\n  • Security: PII encrypted, no secrets in code\n\nThese become the checklist in your pr-review-backend skill.`,
    securityRequirements: `Security rules to check at code review. Required for compliance:\n  • No secrets, API keys, or tokens in source code\n  • PII (emails, IDs, phone numbers) encrypted at rest\n  • Auth on every endpoint — fail-closed by default\n  • Input validation on all user-facing inputs\n  • SQL injection prevention (use ORM/parameterized queries)\n  • No debug endpoints in production configs`,
    codeStyle: `Style rules that your team agrees on. Consistency reduces cognitive load:\n  • Line length: 80, 100, or 120 characters\n  • Export style: named exports vs default exports\n  • Import order: stdlib → third-party → local\n  • Type annotations: explicit vs inferred where possible\n  • no any: ban implicit any, require annotation for exceptions`,
    customNotes: `Free-form section for anything not covered above. Examples:\n  • "Our team does trunk-based development, no long-lived branches"\n  • "We deploy to staging first, then production after smoke tests"\n  • "All API changes must go through an RFC process"\n  • "Backend squad owns migrations, frontend squad owns i18n"\n  • "We use hexagonal/ports-and-adapters architecture"\n\nThis gets injected into skill context so Claude follows your team's process.`,
  };
  return elaborations[q.id] ?? "No elaboration available for this question.";
}

async function writeDecisionsDoc(
  projectRoot: string,
  answers: InterviewAnswers,
  project: DetectedProject,
): Promise<void> {
  const docsDir = path.join(projectRoot, "docs", "architecture");
  fs.ensureDirSync(docsDir);

  const content = [
    `# Project Decisions — ${path.basename(path.resolve(projectRoot))}`,
    "",
    `> Generated by agent-smith interactive interview. Review and edit as needed.`,
    "",
    `**Project type:** ${project.projectType}`,
    `**Generated:** ${new Date().toISOString().split("T")[0]}`,
    "",
    "---",
    "",
    "## Branch & Commit Conventions",
    "",
    `- **Branch naming:** ${answers.branchNaming || "not specified"}`,
    `- **Commit format:** ${answers.commitFormat || "not specified"}`,
    `- **Ticket prefix:** ${answers.ticketPrefix || "none"}`,
    "",
    "## PR Review Checklist",
    "",
    ...(answers.prChecklist.length > 0
      ? answers.prChecklist.map((item) => `- [ ] ${item}`)
      : ["- [ ] (no custom checklist — review per standard criteria)"]),
    "",
    "## Testing Requirements",
    "",
    ...(answers.testingRequirements.length > 0
      ? answers.testingRequirements.map((item) => `- ${item}`)
      : ["- Standard: happy path + error paths + edge cases"]),
    "",
    "## Architecture Rules",
    "",
    ...(answers.architectureRules.length > 0
      ? answers.architectureRules.map((item) => `- **${item}** — PR blocker if violated`)
      : ["- No custom rules specified"]),
    "",
    "## Security Requirements",
    "",
    ...(answers.securityRequirements.length > 0
      ? answers.securityRequirements.map((item) => `- ${item}`)
      : ["- Standard: no secrets in code, input validation"]),
    "",
    "## Code Style",
    "",
    ...(answers.codeStyle.length > 0
      ? answers.codeStyle.map((item) => `- ${item}`)
      : ["- No custom style rules specified"]),
    "",
    ...(answers.customNotes
      ? [
          "## Additional Notes",
          "",
          answers.customNotes,
          "",
        ]
      : []),
    "---",
    "",
    "*These decisions are automatically injected into skill context. Update this file when conventions change — skills will follow.*",
  ].join("\n");

  await fs.writeFile(path.join(docsDir, "decisions.md"), content, "utf-8");
  console.log(chalk.gray(`\n  Decisions saved: docs/architecture/decisions.md`));
}

// Merge interview answers into template variables for skill customization
export function applyInterviewAnswers(
  vars: TemplateVariables,
  answers: InterviewAnswers,
): TemplateVariables {
  const v = { ...vars };

  // Inject custom notes as additional context
  if (answers.customNotes) {
    v.PROJECT_NAME = `${v.PROJECT_NAME}\n\n> Team conventions: ${answers.customNotes}`;
  }

  // Use interview answers for pre-push gates if customized
  if (answers.testingRequirements.length > 0) {
    v.TESTING_REQUIREMENTS = answers.testingRequirements.join("; ");
  }

  if (answers.prChecklist.length > 0) {
    v.PR_CHECKLIST = answers.prChecklist.join("; ");
  }

  // Sentrux: allowCycles overrides the probe-seeded value if the user explicitly said yes
  if (answers.allowCycles?.toLowerCase().startsWith("y")) {
    // User allows cycles — keep existing ratchet value (do not override to 0)
    // If there was no probe value yet, leave SENTRUX_MAX_CYCLES as-is
  } else if (!v.SENTRUX_MAX_CYCLES || v.SENTRUX_MAX_CYCLES === "unknown") {
    // User said no → only force to "0" (enforce mode) if no probe set a ratchet already
    v.SENTRUX_MAX_CYCLES = "0";
  }

  // Sentrux: max CC from interview (may override probe default)
  if (answers.maxCC && /^\d+$/.test(answers.maxCC.trim())) {
    v.SENTRUX_MAX_CC = answers.maxCC.trim();
  }

  return v;
}
