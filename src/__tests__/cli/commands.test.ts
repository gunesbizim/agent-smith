import { describe, it, expect } from "vitest";
import { initCommand } from "../../cli/init.js";
import { doctorCommand } from "../../cli/doctor.js";
import { analyzeCommand } from "../../cli/analyze.js";

describe("CLI Commands", () => {
  // These tests verify commands don't throw and handle various modes
  // They run as stubs — full integration requires a real project directory.
  // NOTE: each command spawns real subprocesses (stack detection, the `sentrux`
  // probe which itself has a 15s timeout when sentrux is absent, the `gh` check),
  // so the default 5s test timeout is too tight on slow CI (notably Windows).
  // Give them a generous timeout to avoid spurious timeout failures.
  const CMD_TIMEOUT = 60_000;

  describe("initCommand", () => {
    it("handles --dry-run mode without filesystem changes", async () => {
      await expect(
        initCommand({ dryRun: true, auto: true }),
      ).resolves.not.toThrow();
    }, CMD_TIMEOUT);

    it("handles --auto mode", async () => {
      await expect(
        initCommand({ auto: true, dryRun: true }),
      ).resolves.not.toThrow();
    }, CMD_TIMEOUT);
  });

  describe("analyzeCommand", () => {
    it("runs in default (text) mode", async () => {
      await expect(
        analyzeCommand({ json: false }),
      ).resolves.not.toThrow();
    }, CMD_TIMEOUT);

    it("runs in JSON mode", async () => {
      await expect(
        analyzeCommand({ json: true }),
      ).resolves.not.toThrow();
    }, CMD_TIMEOUT);
  });

  describe("doctorCommand", () => {
    it("runs without throwing", async () => {
      await expect(doctorCommand()).resolves.not.toThrow();
    }, CMD_TIMEOUT);
  });
});
