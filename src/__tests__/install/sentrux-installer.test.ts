import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { installSentrux } from "../../install/sentrux-installer.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";
import type { TemplateVariables } from "../../shared/types.js";

function makeVars(overrides: Partial<TemplateVariables> = {}): TemplateVariables {
  return { ...DEFAULT_TEMPLATE_VARS, ...overrides };
}

describe("installSentrux", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sentrux-installer-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates .sentrux/ with rules.toml and baseline.json when none exists", async () => {
    const result = await installSentrux(tmpDir, makeVars());

    expect(result.installed).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.configPath).toBe(path.join(tmpDir, ".sentrux"));

    const rulesPath = path.join(tmpDir, ".sentrux", "rules.toml");
    const baselinePath = path.join(tmpDir, ".sentrux", "baseline.json");
    expect(fs.existsSync(rulesPath)).toBe(true);
    expect(fs.existsSync(baselinePath)).toBe(true);
  });

  it("parameterises rules.toml from the SENTRUX_* template vars", async () => {
    await installSentrux(
      tmpDir,
      makeVars({ SENTRUX_MAX_CYCLES: "3", SENTRUX_MAX_CC: "15", SENTRUX_MAX_COUPLING: "B" }),
    );

    const rules = fs.readFileSync(path.join(tmpDir, ".sentrux", "rules.toml"), "utf-8");
    expect(rules).toContain("[constraints]");
    expect(rules).toContain("max_cycles = 3");
    expect(rules).toContain("max_cc = 15");
    expect(rules).toContain('max_coupling = "B"');
    expect(rules).toContain("no_god_files = true");
  });

  it("comments out max_cycles when the probe value is unknown (advisory mode)", async () => {
    await installSentrux(tmpDir, makeVars({ SENTRUX_MAX_CYCLES: "unknown" }));

    const rules = fs.readFileSync(path.join(tmpDir, ".sentrux", "rules.toml"), "utf-8");
    expect(rules).toContain("# max_cycles");
    expect(rules).not.toMatch(/^max_cycles =/m);
  });

  it("seeds baseline.json cycle_count from the probed cycle count", async () => {
    await installSentrux(tmpDir, makeVars({ SENTRUX_MAX_CYCLES: "4" }));

    const baseline = fs.readJsonSync(path.join(tmpDir, ".sentrux", "baseline.json"));
    expect(baseline.cycle_count).toBe(4);
    expect(baseline).toHaveProperty("quality_signal");
    expect(baseline).toHaveProperty("coupling_score");
    expect(baseline).toHaveProperty("timestamp");
  });

  it("skips without overwriting when a config already exists", async () => {
    // First install.
    await installSentrux(tmpDir, makeVars({ SENTRUX_MAX_CC: "10" }));
    const rulesPath = path.join(tmpDir, ".sentrux", "rules.toml");
    const before = fs.readFileSync(rulesPath, "utf-8");

    // Second install with different vars must NOT overwrite.
    const result = await installSentrux(tmpDir, makeVars({ SENTRUX_MAX_CC: "99" }));

    expect(result.installed).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("already configured");
    expect(result.configPath).toBe(path.join(tmpDir, ".sentrux"));

    const after = fs.readFileSync(rulesPath, "utf-8");
    expect(after).toBe(before);
    expect(after).not.toContain("max_cc = 99");
  });

  it("treats a pre-existing .sentrux/ with only baseline.json as already configured", async () => {
    const sentruxDir = path.join(tmpDir, ".sentrux");
    fs.ensureDirSync(sentruxDir);
    fs.writeJsonSync(path.join(sentruxDir, "baseline.json"), { cycle_count: 7 });

    const result = await installSentrux(tmpDir, makeVars());

    expect(result.installed).toBe(false);
    expect(result.skipped).toBe(true);
    expect(fs.existsSync(path.join(sentruxDir, "rules.toml"))).toBe(false);
  });
});
