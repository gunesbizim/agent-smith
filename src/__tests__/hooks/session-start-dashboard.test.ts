import { describe, expect, it } from "vitest";
import path from "node:path";
import { isDisabled, parsePort, resolveDashboardCommand, shouldOpenBrowser } from "../../../hooks/session-start-dashboard.js";

describe("session-start-dashboard hook helpers", () => {
  describe("isDisabled", () => {
    it("is disabled for falsey opt-out values", () => {
      for (const v of ["0", "off", "false", "no", "OFF", "False"]) {
        expect(isDisabled({ AGENT_SMITH_DASHBOARD_AUTOSTART: v })).toBe(true);
      }
    });
    it("is enabled by default and for any other value", () => {
      expect(isDisabled({})).toBe(false);
      expect(isDisabled({ AGENT_SMITH_DASHBOARD_AUTOSTART: "1" })).toBe(false);
      expect(isDisabled({ AGENT_SMITH_DASHBOARD_AUTOSTART: "on" })).toBe(false);
    });
  });

  describe("shouldOpenBrowser", () => {
    it("opens by default, suppressed only by falsey values", () => {
      expect(shouldOpenBrowser({})).toBe(true);
      expect(shouldOpenBrowser({ AGENT_SMITH_DASHBOARD_OPEN: "0" })).toBe(false);
      expect(shouldOpenBrowser({ AGENT_SMITH_DASHBOARD_OPEN: "off" })).toBe(false);
      expect(shouldOpenBrowser({ AGENT_SMITH_DASHBOARD_OPEN: "1" })).toBe(true);
    });
  });

  describe("parsePort", () => {
    it("defaults to 4575 and parses a valid override", () => {
      expect(parsePort({})).toBe(4575);
      expect(parsePort({ AGENT_SMITH_DASHBOARD_PORT: "8080" })).toBe(8080);
      expect(parsePort({ AGENT_SMITH_DASHBOARD_PORT: "nonsense" })).toBe(4575);
      expect(parsePort({ AGENT_SMITH_DASHBOARD_PORT: "-3" })).toBe(4575);
    });
  });

  describe("resolveDashboardCommand", () => {
    const hookDir = "/pkg/hooks";
    it("prefers AGENT_SMITH_BIN when it exists", () => {
      const r = resolveDashboardCommand(hookDir, { AGENT_SMITH_BIN: "/custom/cli.js" }, (p) => p === "/custom/cli.js");
      expect(r.cmd).toBe(process.execPath);
      expect(r.args).toEqual(["/custom/cli.js", "dashboard"]);
    });
    it("falls back to the package-local bin when present", () => {
      const localBin = path.resolve(hookDir, "..", "bin", "agent-smith.js");
      const r = resolveDashboardCommand(hookDir, {}, (p) => p === localBin);
      expect(r.cmd).toBe(process.execPath);
      expect(r.args).toEqual([localBin, "dashboard"]);
    });
    it("falls back to the agent-smith command on PATH when nothing else resolves", () => {
      const r = resolveDashboardCommand(hookDir, {}, () => false);
      expect(r.cmd).toBe("agent-smith");
      expect(r.args).toEqual(["dashboard"]);
    });
  });
});
