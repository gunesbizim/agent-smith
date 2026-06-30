import { describe, expect, it } from "vitest";
import {
  addSession,
  pruneSessions,
  removeSession,
  shouldStopDashboard,
} from "../../../hooks/lib/dashboard-state.js";

const alive =
  (...live: number[]) =>
  (pid: number) =>
    live.includes(pid);

describe("dashboard-state helpers", () => {
  describe("addSession", () => {
    it("appends a new session", () => {
      expect(addSession([], "a", 100)).toEqual([{ id: "a", ppid: 100 }]);
    });
    it("replaces an existing entry with the same id (last writer wins)", () => {
      const out = addSession([{ id: "a", ppid: 1 }], "a", 200);
      expect(out).toEqual([{ id: "a", ppid: 200 }]);
    });
    it("tolerates a null/undefined session list", () => {
      expect(addSession(undefined, "a", 1)).toEqual([{ id: "a", ppid: 1 }]);
    });
  });

  describe("removeSession", () => {
    it("drops the matching id and keeps the rest", () => {
      const out = removeSession([{ id: "a", ppid: 1 }, { id: "b", ppid: 2 }], "a");
      expect(out).toEqual([{ id: "b", ppid: 2 }]);
    });
  });

  describe("pruneSessions", () => {
    it("keeps only sessions whose ppid is alive", () => {
      const out = pruneSessions([{ id: "a", ppid: 1 }, { id: "b", ppid: 2 }], alive(2));
      expect(out).toEqual([{ id: "b", ppid: 2 }]);
    });
    it("keeps entries without a ppid (cannot prove dead)", () => {
      const out = pruneSessions([{ id: "a", ppid: null }], alive());
      expect(out).toEqual([{ id: "a", ppid: null }]);
    });
  });

  describe("shouldStopDashboard", () => {
    const state = (sessions: Array<{ id: string; ppid: number }>, over: Record<string, unknown> = {}) => ({
      pid: 999,
      port: 4575,
      autostarted: true,
      sessions,
      ...over,
    });

    it("stops when the ending session is the last one (pure refcount)", () => {
      expect(shouldStopDashboard(state([{ id: "a", ppid: 1 }]), "a")).toBe(true);
    });

    it("keeps running when another session remains", () => {
      const s = state([{ id: "a", ppid: 1 }, { id: "b", ppid: 2 }]);
      expect(shouldStopDashboard(s, "a")).toBe(false);
    });

    it("does NOT use ppid liveness — a sibling entry keeps it alive even if that process is gone", () => {
      // Guards against prematurely killing a dashboard a live sibling session is still using:
      // ppid is a transient shell under Claude Code, so it is never the kill signal.
      const s = state([{ id: "a", ppid: 1 }, { id: "b", ppid: 2 }]);
      expect(shouldStopDashboard(s, "a")).toBe(false);
    });

    it("never stops a dashboard we did not auto-start", () => {
      expect(shouldStopDashboard(state([], { autostarted: false }), "a")).toBe(false);
    });

    it("never stops when there is no recorded pid", () => {
      expect(shouldStopDashboard(state([], { pid: null }), "a")).toBe(false);
    });

    it("returns false for null state", () => {
      expect(shouldStopDashboard(null, "a")).toBe(false);
    });
  });
});
