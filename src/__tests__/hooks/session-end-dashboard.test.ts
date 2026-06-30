import { describe, expect, it } from "vitest";
import { isDisabled } from "../../../hooks/session-end-dashboard.js";

describe("session-end-dashboard hook helpers", () => {
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
});
