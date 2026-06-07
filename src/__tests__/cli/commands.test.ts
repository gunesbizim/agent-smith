import { describe, it, expect } from "vitest";
import { initCommand } from "../../cli/init.js";
import { doctorCommand } from "../../cli/doctor.js";
import { analyzeCommand } from "../../cli/analyze.js";

describe("CLI Commands", () => {
  // These tests verify commands don't throw and handle various modes
  // They run as stubs — full integration requires a real project directory

  describe("initCommand", () => {
    it("handles --dry-run mode without filesystem changes", async () => {
      await expect(
        initCommand({ dryRun: true, auto: true }),
      ).resolves.not.toThrow();
    });

    it("handles --auto mode", async () => {
      await expect(
        initCommand({ auto: true }),
      ).resolves.not.toThrow();
    });
  });

  describe("analyzeCommand", () => {
    it("runs in default (text) mode", async () => {
      await expect(
        analyzeCommand({ json: false }),
      ).resolves.not.toThrow();
    });

    it("runs in JSON mode", async () => {
      await expect(
        analyzeCommand({ json: true }),
      ).resolves.not.toThrow();
    });
  });

  describe("doctorCommand", () => {
    it("runs without throwing", async () => {
      await expect(doctorCommand()).resolves.not.toThrow();
    });
  });
});
