// B7 — guard against CLI/docs drift. The marketing docs (docs/index.html) must not
// advertise a top-level `agent-smith <cmd>` that the CLI does not actually register.
// This is the failable check that would have caught the fabricated `agent-smith insights`
// row (the real capability is the `/insights` skill, not a CLI command).
import { describe, it, expect } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// The single source of truth for registered subcommands lives in src/cli/index.ts as
// `.command("name ...")` calls. Parse them so the test tracks reality, not a hardcoded list.
function registeredCommands(): Set<string> {
  const src = fs.readFileSync(path.join(repoRoot, "src/cli/index.ts"), "utf-8");
  const cmds = new Set<string>();
  for (const m of src.matchAll(/\.command\(\s*["'`]([a-z][\w-]*)/g)) {
    cmds.add(m[1]);
  }
  return cmds;
}

// Every `agent-smith <word>` mentioned as a command in the docs.
function docsAdvertisedCommands(): string[] {
  const html = fs.readFileSync(path.join(repoRoot, "docs/index.html"), "utf-8");
  return [...html.matchAll(/agent-smith\s+([a-z][\w-]*)/g)].map((m) => m[1]);
}

describe("CLI/docs command parity (B7)", () => {
  it("registers a non-trivial set of commands", () => {
    expect(registeredCommands().size).toBeGreaterThan(0);
  });

  it("docs never advertise a command the CLI does not register", () => {
    const registered = registeredCommands();
    const advertised = docsAdvertisedCommands();
    const phantom = advertised.filter((c) => !registered.has(c));
    expect(phantom).toEqual([]);
  });

  it("does not advertise the removed `insights` CLI command", () => {
    expect(docsAdvertisedCommands()).not.toContain("insights");
  });
});
