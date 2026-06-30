import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { removeGitnexusAgentsMd, GITNEXUS_AGENTS_MARKER } from "../../install/agents-md-cleanup.js";

describe("removeGitnexusAgentsMd", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-md-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("deletes AGENTS.md when it is gitnexus-authored (marker present)", () => {
    const agentsPath = path.join(tmpDir, "AGENTS.md");
    fs.writeFileSync(agentsPath, `${GITNEXUS_AGENTS_MARKER}\n# GitNexus MCP\n<!-- gitnexus:end -->\n`);
    expect(removeGitnexusAgentsMd(tmpDir)).toBe(true);
    expect(fs.existsSync(agentsPath)).toBe(false);
  });

  it("leaves a hand-written AGENTS.md (no gitnexus marker) untouched", () => {
    const agentsPath = path.join(tmpDir, "AGENTS.md");
    const handwritten = "# My agents\nThese are my own notes.\n";
    fs.writeFileSync(agentsPath, handwritten);
    expect(removeGitnexusAgentsMd(tmpDir)).toBe(false);
    expect(fs.readFileSync(agentsPath, "utf-8")).toBe(handwritten);
  });

  it("is a no-op when AGENTS.md does not exist", () => {
    expect(removeGitnexusAgentsMd(tmpDir)).toBe(false);
  });

  it("does not throw when the path is unreadable", () => {
    expect(() => removeGitnexusAgentsMd(path.join(tmpDir, "does", "not", "exist"))).not.toThrow();
  });
});
