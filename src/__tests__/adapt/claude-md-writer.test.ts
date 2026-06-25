// Guards the core promise: agent-smith owns ONLY the marked block in CLAUDE.md and never
// clobbers the user's own content.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { writeClaudeMd, START_MARKER, END_MARKER } from "../../adapt/claude-md-writer.js";

describe("writeClaudeMd", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-smith-claudemd-"));
    // Scaffold a couple of commands + a skill so the block has content to enumerate.
    fs.ensureDirSync(path.join(tmp, ".claude", "commands"));
    fs.writeFileSync(path.join(tmp, ".claude", "commands", "as-ship.md"), "You are the ship workflow — commit to green PR.\n");
    fs.ensureDirSync(path.join(tmp, ".claude", "skills", "smith-mode"));
    fs.writeFileSync(
      path.join(tmp, ".claude", "skills", "smith-mode", "SKILL.md"),
      "---\nname: smith-mode\ndescription: Staged execution discipline.\n---\n# Smith Mode\n",
    );
  });

  afterEach(() => fs.removeSync(tmp));

  it("creates CLAUDE.md with a marked block enumerating commands and skills", () => {
    const res = writeClaudeMd(tmp, false);
    expect(res.created).toBe(true);
    const content = fs.readFileSync(res.path, "utf-8");
    expect(content).toContain(START_MARKER);
    expect(content).toContain(END_MARKER);
    expect(content).toContain("/as-ship");
    expect(content).toContain("smith-mode");
  });

  it("preserves existing user content and only replaces the managed block on re-run", () => {
    const userContent = "# My Project Rules\n\nAlways use tabs. Never push to main.\n";
    fs.writeFileSync(path.join(tmp, "CLAUDE.md"), userContent);

    writeClaudeMd(tmp, false);
    let content = fs.readFileSync(path.join(tmp, "CLAUDE.md"), "utf-8");
    expect(content).toContain("Always use tabs. Never push to main.");
    expect(content).toContain(START_MARKER);

    // Add another command, re-run — user content stays, block refreshes, no duplicate markers.
    fs.writeFileSync(path.join(tmp, ".claude", "commands", "as-test.md"), "You are the test orchestrator.\n");
    writeClaudeMd(tmp, false);
    content = fs.readFileSync(path.join(tmp, "CLAUDE.md"), "utf-8");

    expect(content).toContain("Always use tabs. Never push to main.");
    expect(content).toContain("/as-test");
    expect(content.match(new RegExp(START_MARKER, "g")) ?? []).toHaveLength(1);
    expect(content.match(new RegExp(END_MARKER, "g")) ?? []).toHaveLength(1);
  });

  it("dry run does not write a file", () => {
    const res = writeClaudeMd(tmp, true);
    expect(res.written).toBe(false);
    expect(fs.existsSync(path.join(tmp, "CLAUDE.md"))).toBe(false);
  });
});
