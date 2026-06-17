// Consent prompt for programmatic MCP installs.
//
// agent-smith installs MCP servers programmatically during `init`/`configure`.
// Because that runs real package-manager commands on the developer's machine, we
// ask for approval first — a single batch prompt that lists every server and the
// exact command that will run. The non-interactive rules are the important part:
// we NEVER block on a prompt that can't be answered (CI, piped stdin).
import readline from "node:readline";
import chalk from "chalk";
import { resolveInstallCommand } from "./mcp-installer.js";
import { requiredManagersFor } from "./package-managers.js";
import type { MCPServerDefinition } from "../shared/types.js";

export interface ConsentOptions {
  /** Approve all without prompting (also implied by --auto). */
  yes?: boolean;
  /** Skip installation entirely — never prompt, never install. */
  noInstall?: boolean;
  /** Non-interactive interview mode — treated as batch-approve so CI stays unblocked. */
  auto?: boolean;
}

export interface ConsentResult {
  approved: boolean;
  reason?: string;
}

export interface ConsentIO {
  isTTY?: boolean;
  /** Override the prompt for tests; returns the raw answer string. */
  prompt?: (message: string) => Promise<string>;
}

/** Default readline prompt; resolves "" when not on a TTY. */
async function readlinePrompt(message: string): Promise<string> {
  if (!process.stdin.isTTY) return "";
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((resolve) => rl.question(message, resolve));
    return answer.trim();
  } finally {
    rl.close();
  }
}

/** Print the batch list of servers + the actual command each will run. */
export function describeInstallPlan(servers: MCPServerDefinition[]): string {
  const lines = servers.map((s) => {
    const cmd = resolveInstallCommand(s);
    const detail =
      s.installType === "manual"
        ? chalk.gray("manual install required")
        : s.installType === "npx" && !cmd
          ? chalk.gray("fetched on first use (npx)")
          : s.installType === "prewarm"
            ? `${chalk.gray("pre-warm")} ${chalk.cyan(cmd)}`
            : chalk.cyan(cmd);
    return `    • ${s.name.padEnd(16)} ${detail}`;
  });
  const managers = requiredManagersFor(servers);
  const mgrLine = managers.length ? `\n  Requires: ${managers.join(", ")}` : "";
  return `${lines.join("\n")}${mgrLine}`;
}

/**
 * Decide whether to proceed with installs.
 *
 * Precedence:
 *   --no-install            → declined (no prompt)
 *   --yes / --auto          → approved (no prompt)
 *   interactive TTY         → prompt (Enter/y = approve, n = decline)
 *   non-interactive, no flag → declined (NEVER hang on an unanswerable prompt)
 */
export async function resolveConsent(
  servers: MCPServerDefinition[],
  opts: ConsentOptions = {},
  io: ConsentIO = {},
): Promise<ConsentResult> {
  if (servers.length === 0) return { approved: false, reason: "no servers to install" };
  if (opts.noInstall) return { approved: false, reason: "skipped via --no-install" };
  if (opts.yes || opts.auto) return { approved: true };

  const isTTY = io.isTTY ?? Boolean(process.stdin.isTTY);
  if (!isTTY) {
    return {
      approved: false,
      reason: "non-interactive — re-run with --yes to install, or run `agent-smith configure` later",
    };
  }

  const prompt = io.prompt ?? readlinePrompt;
  console.log(chalk.white("\nThe following MCP servers will be installed:"));
  console.log(describeInstallPlan(servers));
  const answer = (await prompt(chalk.white(`\nInstall these ${servers.length} MCP servers? [Y/n] `))).trim().toLowerCase();
  const approved = answer === "" || answer === "y" || answer === "yes";
  return approved ? { approved: true } : { approved: false, reason: "declined at prompt" };
}
