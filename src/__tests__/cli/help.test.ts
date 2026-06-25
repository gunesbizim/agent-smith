import { describe, it, expect } from "vitest";
import { buildProgram } from "../../cli/index.js";

/** Capture the full help output including addHelpText("after", …) content. */
function fullHelp(): string {
  const prog = buildProgram();
  let out = "";
  prog.configureOutput({ writeOut: (s: string) => { out += s; } });
  prog.outputHelp();
  return out;
}

describe("CLI help output", () => {
  it("contains all registered command names", () => {
    const help = buildProgram().helpInformation();
    const commands = [
      "init",
      "configure",
      "analyze",
      "doctor",
      "confirm",
      "ticket",
      "pipeline",
      "run",
      "dashboard",
    ];
    for (const cmd of commands) {
      expect(help, `help should mention command '${cmd}'`).toContain(cmd);
    }
  });

  it("contains 'Command groups:' section", () => {
    expect(fullHelp()).toContain("Command groups:");
  });

  it("contains 'Examples:' section", () => {
    expect(fullHelp()).toContain("Examples:");
  });

  it("contains at least one example line with 'agent-smith run'", () => {
    expect(fullHelp()).toContain("agent-smith run");
  });

  it("every registered subcommand has a non-empty description", () => {
    const prog = buildProgram();
    for (const cmd of prog.commands) {
      expect(
        cmd.description(),
        `Command '${cmd.name()}' is missing a description`,
      ).toBeTruthy();
    }
  });
});
