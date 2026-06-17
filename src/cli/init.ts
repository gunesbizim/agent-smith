// init command — full project bootstrap
import chalk from "chalk";
import ora from "ora";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import { analyzeProject } from "../analyze/analyze-project.js";
import { probeSentrux } from "../analyze/architecture-sniffer.js";
import { installSentrux } from "../install/sentrux-installer.js";
import { writeClaudeMd } from "../adapt/claude-md-writer.js";
import { resolveSourceDirs } from "../analyze/source-dir.js";
import { writeSourceConfig } from "../scaffold/source-config.js";
import { runInterview, applyInterviewAnswers } from "../adapt/project-interview.js";
import { checkDependencies } from "../install/dependency-checker.js";
import { ensureGhCli } from "../install/gh-installer.js";
import { configureMCPs, registerLocalMCPs } from "../install/mcp-installer.js";
import { installWithConsent } from "../install/install-flow.js";
import { setupObsidianVault } from "../install/obsidian-vault.js";
import { scaffoldCommands } from "../scaffold/commands.js";
import { scaffoldSkills } from "../scaffold/skills.js";
import { scaffoldConfigs } from "../scaffold/configs.js";
import { scaffoldHooks } from "../scaffold/hooks.js";
import { scaffoldPermissions } from "../scaffold/permissions.js";
import { scaffoldCI } from "../scaffold/ci-workflow.js";
import { customizeSkills } from "../adapt/skill-customizer.js";
import { writeArchitectureDocs } from "../adapt/architecture-writer.js";
import { generateSkills, GENERATED_SKILLS } from "../adapt/llm-skills.js";
import { writeMarker } from "../adapt/skill-gen-marker.js";
import { renderSkillsReport } from "./skills-report.js";
import { cavemanCompress } from "../adapt/caveman-compress.js";
import type { TemplateVariables } from "../shared/types.js";

// agent-smith's own version (read from the package.json shipped with it) for the A11 manifest.
const AGENT_SMITH_VERSION: string = (() => {
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
    return (JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

// Walk a directory recursively, returning all file paths
function walkFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

interface InitOptions {
  platform?: string;
  auto?: boolean;
  dryRun?: boolean;
  dir?: string;
  caveman?: boolean;
  noInterview?: boolean;
  llm?: boolean;
  /** Approve MCP installs without prompting. */
  yes?: boolean;
  /** Commander maps `--no-install` to `install: false`; undefined/true means install. */
  install?: boolean;
  /** Re-run LLM skill generation even if the first-run marker is present (`--regen-skills`). */
  regenSkills?: boolean;
}

export async function initCommand(opts: InitOptions): Promise<void> {
  const cwd = opts.dir ? path.resolve(opts.dir) : process.cwd();
  const platform = opts.platform || "claude-code";

  console.log(chalk.bold.cyan("\n⚒ Agent Smith — Project Initialization\n"));
  console.log(chalk.gray(`  Platform: ${platform}`));
  console.log(chalk.gray(`  Target:   ${cwd}\n`));

  // Step 1 — Check dependencies
  const depSpinner = ora("Checking system dependencies...").start();
  const depResult = await checkDependencies();
  if (!depResult.ok) {
    depSpinner.fail("Missing dependencies:");
    for (const d of depResult.missing) {
      console.log(chalk.red(`  ✗ ${d.name} — ${d.installHint}`));
    }
    console.log(chalk.yellow("\nInstall missing dependencies and re-run."));
    return;
  }
  depSpinner.succeed(`Node ${depResult.nodeVersion}, npm ${depResult.npmVersion}, git ${depResult.gitVersion}`);

  // Step 1b — Ensure the GitHub CLI (gh). Required by the git/ship workflows
  // (PR creation, CI polling). Best-effort: auto-install when a no-sudo package
  // manager is available, otherwise print a manual hint — never block init.
  if (!opts.dryRun) {
    const ghSpinner = ora("Ensuring GitHub CLI (gh)...").start();
    const gh = await ensureGhCli();
    if (gh.alreadyPresent) {
      ghSpinner.succeed("GitHub CLI present");
    } else if (gh.installed) {
      ghSpinner.succeed("GitHub CLI installed — run `gh auth login` once to enable PR creation");
    } else {
      ghSpinner.warn(`GitHub CLI not installed — ${gh.reason}`);
    }
  }

  // Steps 2–4 — the shared analysis pipeline (B11): detect → (LLM refine) → sniff →
  // scanPackages → synthesize stack → map vars → apply the D1 ledger. One builder, also used
  // by `analyze`, so the two can never drift. LLM refinement runs on-by-default when claude is
  // present; --no-llm forces the fast path. init then layers the sentrux probe + interview on
  // the returned templateVars.
  const llmRequested = opts.llm !== false;
  const analysisSpinner = ora("Analyzing project (detect → stack → best practices)...").start();
  const analysis = await analyzeProject(cwd, { useLlm: llmRequested && !opts.dryRun });
  const project = analysis.project;
  const patterns = analysis.patterns;
  const stackProfile = analysis.stackProfile;
  const ledger = analysis.ledger;
  let templateVars: TemplateVariables = analysis.templateVars;
  if (llmRequested && !opts.dryRun && !analysis.llmRefined) {
    analysisSpinner.warn(`LLM refinement skipped: ${analysis.llmReason}`);
    analysisSpinner.start();
  }
  const confirmedCount = Object.keys(ledger.values).filter((k) => ledger.values[k].source === "confirmed").length;
  analysisSpinner.succeed(
    `Detected: ${project.backend?.framework ?? "no backend"} / ${project.frontend?.framework ?? "no frontend"} · ` +
    `${patterns.length} patterns · stack ${stackProfile.language ?? "none"}${stackProfile.framework ? "/" + stackProfile.framework : ""}${confirmedCount ? ` · ${confirmedCount} confirmed` : ""}`,
  );

  // Step 4c — Sentrux probe (live scan to seed rules.toml thresholds)
  const sentruxSpinner = ora("Probing architecture quality (sentrux scan)...").start();
  const sentruxProbe = await probeSentrux(cwd);
  if (sentruxProbe.available) {
    const cycles = sentruxProbe.cycles ?? 0;

    if (cycles === 0) {
      // Enforce mode: zero cycles now → keep it that way
      templateVars.SENTRUX_MAX_CYCLES = "0";
      sentruxSpinner.succeed(
        `sentrux: max_cycles=0 (enforce mode) — 0 cycles detected, quality_signal=${sentruxProbe.qualitySignal ?? "n/a"}`,
      );
    } else {
      // Ratchet mode: existing debt → lock current count, block increases
      templateVars.SENTRUX_MAX_CYCLES = String(cycles);
      sentruxSpinner.warn(
        `sentrux: max_cycles=0 would FAIL now (${cycles} cycle${cycles === 1 ? "" : "s"}) → seeding max_cycles=${cycles} (ratchet)`,
      );
    }

    if (sentruxProbe.maxCC != null) {
      templateVars.SENTRUX_MAX_CC = String(sentruxProbe.maxCC);
    }
    if (sentruxProbe.couplingGrade != null) {
      templateVars.SENTRUX_MAX_COUPLING = sentruxProbe.couplingGrade;
    }
  } else {
    // Probe failed (binary missing or scan error) — advisory mode
    templateVars.SENTRUX_MAX_CYCLES = "unknown";
    sentruxSpinner.warn(
      "sentrux not available — rules.toml will have max_cycles commented out (advisory mode). Install sentrux and re-run.",
    );
  }

  // Step 4b — Interactive interview (unless --auto or --no-interview)
  let interviewAnswers = null;
  if (!opts.auto && !opts.noInterview && !opts.dryRun) {
    const sentruxForInterview = sentruxProbe.available
      ? { cycles: sentruxProbe.cycles, maxCC: sentruxProbe.maxCC }
      : undefined;
    try {
      interviewAnswers = await runInterview(cwd, project, sentruxForInterview);
      if (interviewAnswers) {
        templateVars = applyInterviewAnswers(templateVars, interviewAnswers);
      }
    } catch (err) {
      console.log(chalk.yellow(`\n  Interview skipped: ${err instanceof Error ? err.message : err}`));
    }
    console.log(chalk.gray(""));
  } else if (opts.auto || opts.noInterview) {
    console.log(chalk.gray("  Interview: skipped (--auto or --no-interview)"));
  }

  // Step 5 — Scaffold commands
  const cmdSpinner = ora("Scaffolding commands...").start();
  const targetDir = cwd;
  await scaffoldCommands(targetDir, templateVars, opts.dryRun);
  cmdSpinner.succeed("Commands scaffolded");

  // Step 6 — Scaffold skills
  const skillSpinner = ora("Scaffolding skills...").start();
  await scaffoldSkills(targetDir, templateVars, opts.dryRun);
  skillSpinner.succeed("Skills scaffolded");

  // Step 7 — Customize skills
  const customizeSpinner = ora("Customizing skills for detected stack...").start();
  await customizeSkills(targetDir, templateVars, opts.dryRun);
  customizeSpinner.succeed("Skills customized");

  // Step 8 — Write architecture docs (LLM-grounded when claude is present, unless --no-llm)
  const archDocSpinner = ora("Generating architecture documentation...").start();
  await writeArchitectureDocs(targetDir, templateVars, opts.dryRun, {
    useLlm: opts.llm !== false,
    project,
    onProgress: (m) => { archDocSpinner.text = m; },
  });
  archDocSpinner.succeed("Architecture docs written");

  // NOTE (P3): LLM skill generation no longer runs here. It is the FINAL step of init,
  // after MCP install/config + hooks + CLAUDE.md, so the spawned claude can use the project's
  // MCP servers (P2) and run against the fully-configured environment. See the end of init.

  // Step 8c — Install sentrux: write BOTH .sentrux/rules.toml and a starter baseline.json
  // (the gate's regression reference, previously never scaffolded). Idempotent — preserves
  // an existing .sentrux/ config.
  const sentruxRulesSpinner = ora("Installing sentrux quality gate (.sentrux/)...").start();
  if (opts.dryRun) {
    sentruxRulesSpinner.info("sentrux install skipped (--dry-run)");
  } else {
    const sentruxInstall = await installSentrux(targetDir, templateVars);
    if (sentruxInstall.installed) {
      sentruxRulesSpinner.succeed(".sentrux/ installed (rules.toml + baseline.json)");
    } else {
      sentruxRulesSpinner.info(`sentrux: ${sentruxInstall.reason ?? "left existing config untouched"}`);
    }
  }

  // Step 8b — Caveman compression (if enabled)
  if (opts.caveman && !opts.dryRun) {
    const cavemanSpinner = ora("Applying caveman compression...").start();
    const skillDir = path.join(targetDir, ".claude", "skills");
    const archDir = path.join(targetDir, "docs", "architecture");
    for (const dir of [skillDir, archDir]) {
      if (fs.existsSync(dir)) {
        for (const file of walkFiles(dir)) {
          if (file.endsWith(".md")) {
            const content = await fs.readFile(file, "utf-8");
            const compressed = cavemanCompress(content);
            await fs.writeFile(file, compressed, "utf-8");
          }
        }
      }
    }
    cavemanSpinner.succeed("Caveman compression applied (~75% token savings)");
  }

  // Step 9 — Install MCP server binaries programmatically (consent-gated). This
  // runs AFTER the interview so the developer has finished interacting, and is
  // the single place agent-smith installs MCPs — nothing relies on the configure
  // command, generated skills, or Claude Code to do it. Stack-gated by `project`.
  if (!opts.dryRun) {
    const { consent } = await installWithConsent(
      { project },
      { yes: opts.yes, noInstall: opts.install === false, auto: opts.auto },
    );
    if (!consent.approved) {
      console.log(chalk.yellow(`  ⊘ Skipping MCP install — ${consent.reason}.`));
      console.log(chalk.gray("    Run `agent-smith configure` later to install them."));
    }
  }

  // Step 9b — Write the MCP configuration bundle (stack-aware; browser MCPs only
  // when a frontend exists). This is config-file generation, not installation.
  const mcpSpinner = ora("Configuring MCP servers...").start();
  await configureMCPs(targetDir, templateVars, platform, opts.dryRun, project);
  mcpSpinner.succeed("MCP servers configured");

  // Step 10 — Write MCP configs
  const configSpinner = ora("Writing MCP configuration files...").start();
  await scaffoldConfigs(targetDir, platform, opts.dryRun);
  configSpinner.succeed("MCP configurations written");

  // Step 10c — Resolve source directories (for layout-agnostic change detection in hooks)
  const srcSpinner = ora("Resolving source directories...").start();
  const interactive = !opts.auto && !opts.noInterview && !opts.dryRun;
  if (interactive) srcSpinner.stop(); // release the spinner so the prompt is readable
  const sourceDirs = await resolveSourceDirs(targetDir, project, { interactive });
  await writeSourceConfig(targetDir, sourceDirs, opts.dryRun);
  srcSpinner.succeed(`Source directories: ${sourceDirs.join(", ")}`);

  // Step 10d — Register local-scope MCP servers (obsidian). configureMCPs above
  // only writes file-based scopes and deliberately skips "local" scope, so without
  // this step `init` never set up obsidian at all. setupObsidianVault also CREATES
  // the vault directory — mcp-obsidian points at an existing dir and won't make one.
  if (!opts.dryRun && platform === "claude-code") {
    const vault = await setupObsidianVault(targetDir, { interactive });
    if (vault.vaultPath && vault.created) {
      console.log(chalk.gray(`  Created Obsidian vault: ${vault.vaultPath}`));
    }
    const localSpinner = ora("Registering local-scope MCP servers...").start();
    const { registered, skipped } = registerLocalMCPs(templateVars, platform);
    if (registered.length > 0) {
      localSpinner.succeed(`Registered local MCP servers: ${registered.join(", ")}`);
    } else {
      const skippedNote = skipped.length ? ` (skipped: ${skipped.join(", ")})` : "";
      localSpinner.info(`No local MCP servers registered${skippedNote}`);
    }
  }

  // Step 11 — Scaffold hooks
  const hooksSpinner = ora("Setting up automation hooks...").start();
  await scaffoldHooks(targetDir, opts.dryRun);
  // A9 — generate the per-stack permission policy + settings.permissions block; the
  // pre-tool-permission-guard hook (registered above) enforces the deny rules at runtime.
  await scaffoldPermissions(targetDir, project, opts.dryRun);
  // A8 — generate a stack-aware CI workflow from the detected real commands (non-clobbering name).
  const ciWritten = await scaffoldCI(targetDir, templateVars, opts.dryRun);
  hooksSpinner.succeed(`Automation hooks + permission policy${ciWritten ? " + CI workflow" : ""} configured`);

  // Step 12 — Write/refresh the agent-smith managed block in CLAUDE.md. Runs LAST so it can
  // enumerate every command and skill just scaffolded. Non-destructive: only the content
  // between the <!-- agent-smith:start --> / <!-- agent-smith:end --> markers is owned by
  // agent-smith; the user's own CLAUDE.md content is preserved.
  const claudeMdSpinner = ora("Writing CLAUDE.md (agent-smith managed block)...").start();
  const claudeMd = writeClaudeMd(targetDir, opts.dryRun);
  claudeMdSpinner.succeed(`CLAUDE.md ${claudeMd.created ? "created" : "updated"} (commands + skills documented)`);

  // Step 13 (FINAL) — LLM-author skills grounded in the architecture docs + real code, now
  // that the environment is fully configured (MCP servers + .mcp.json present, hooks written).
  // The spawn runs with the project's MCP enabled and project hooks suppressed (P2/P3). Gated
  // to run once per repo via a marker; re-run with `--regen-skills`. Best-effort: a failure or
  // an absent claude keeps the template-customized skills and never blocks init.
  if (opts.llm !== false && !opts.dryRun) {
    const skillGenSpinner = ora("Generating skills with Claude (live project, MCP enabled)...").start();
    const result = generateSkills(targetDir, {
      useProjectMcp: true,
      suppressHooks: true,
      regen: opts.regenSkills,
    });
    if (result.ran) {
      writeMarker(targetDir, {
        generatedAt: new Date().toISOString(),
        stack: `${stackProfile.language ?? "none"}${stackProfile.framework ? "/" + stackProfile.framework : ""}`,
        skills: GENERATED_SKILLS,
        // A11 — reproducibility manifest: which prompt + agent-smith version produced these skills.
        promptHash: result.promptHash,
        agentSmithVersion: AGENT_SMITH_VERSION,
      });
      skillGenSpinner.succeed("Skills generated by Claude");
      // P4: show the structured report when the model emitted one; else fall back to summary.
      if (result.report) {
        renderSkillsReport(result.report);
      } else if (result.summary) {
        console.log(chalk.gray(`  ${result.summary}`));
      }
    } else {
      skillGenSpinner.warn(`LLM skill generation skipped (${result.reason}); using template-customized skills`);
    }
  }

  console.log(chalk.bold.green("\n✓ Agent Smith initialized successfully!\n"));
  console.log(chalk.white("Next steps:"));
  console.log(chalk.gray("  1. Restart Claude Code to load new MCP servers, skills, and hooks"));
  console.log(chalk.gray("  2. Hooks will auto-check health on session start, guard git ops, detect changes on stop"));
  console.log(chalk.gray("  3. Try: /as-backend 'add a health endpoint'"));
  console.log(chalk.gray("  4. Try: /as-frontend 'create a dashboard view'"));
  console.log(chalk.gray("  5. Run: npx agent-smith doctor for health check\n"));
}
