// D1 — ground-truth ledger: authority order, read-first short-circuit, confirm round-trip, stale.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import {
  ledgerPath,
  readLedger,
  writeLedger,
  getConfirmed,
  resolveAuthority,
  applyConfirmations,
  findStale,
} from "../../artifacts/ground-truth.js";
import { parseConfirmPair } from "../../cli/confirm.js";
import type { GroundTruthLedger } from "../../shared/types.js";

describe("ground-truth ledger (D1)", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-")); });
  afterEach(() => { fs.removeSync(tmp); });

  it("ledgerPath lives under .agent-smith and reads empty when absent", () => {
    expect(ledgerPath(tmp)).toBe(path.join(tmp, ".agent-smith", "ground-truth.json"));
    expect(readLedger(tmp).values).toEqual({});
  });

  it("round-trips a written ledger", () => {
    const led: GroundTruthLedger = { version: 1, values: { "backend.orm": { value: null, source: "confirmed", by: "human" } } };
    writeLedger(tmp, led);
    expect(getConfirmed(readLedger(tmp), "backend.orm")?.source).toBe("confirmed");
  });

  it("corrupt ledger reads as empty rather than throwing", () => {
    const f = ledgerPath(tmp);
    fs.ensureDirSync(path.dirname(f));
    fs.writeFileSync(f, "{ not json");
    expect(readLedger(tmp).values).toEqual({});
  });

  describe("authority order: confirmed ▸ detected ▸ inferred ▸ fallback", () => {
    it("a confirmed value wins and short-circuits re-inference for that key", () => {
      const led = applyConfirmations({ version: 1, values: {} }, [{ key: "backend.testCommand", value: "go test ./..." }], "human", "2026-06-17T00:00:00Z");
      const r = resolveAuthority(led, "backend.testCommand", {
        detected: "pytest", inferred: "npm test", fallback: "none",
      });
      expect(r?.value).toBe("go test ./...");
      expect(r?.source).toBe("confirmed");
    });

    it("detected beats inferred beats fallback when not confirmed", () => {
      const led: GroundTruthLedger = { version: 1, values: {} };
      expect(resolveAuthority(led, "k", { detected: "d", inferred: "i", fallback: "f" })?.source).toBe("detected");
      expect(resolveAuthority(led, "k", { inferred: "i", fallback: "f" })?.source).toBe("inferred");
      expect(resolveAuthority(led, "k", { fallback: "f" })?.source).toBe("fallback");
      expect(resolveAuthority(led, "k", {})).toBeNull();
    });
  });

  it("applyConfirmations settles keys and a subsequent read returns them verbatim", () => {
    const led = applyConfirmations({ version: 1, values: {} }, [
      { key: "backend.orm", value: null },
      { key: "backend.framework", value: "echo" },
    ], "human", "2026-06-17T00:00:00Z");
    writeLedger(tmp, led);
    const back = readLedger(tmp);
    expect(getConfirmed(back, "backend.orm")?.value).toBeNull();
    expect(getConfirmed(back, "backend.framework")?.value).toBe("echo");
    expect(back.confirmedAt).toBe("2026-06-17T00:00:00Z");
  });

  it("findStale flags a confirmed value the repo now contradicts (never silently overwrites)", () => {
    const led = applyConfirmations({ version: 1, values: {} }, [{ key: "backend.framework", value: "echo" }], "human", "t");
    const stale = findStale(led, { "backend.framework": "gin", "backend.orm": null });
    expect(stale).toEqual([{ key: "backend.framework", confirmed: "echo", detected: "gin" }]);
  });

  it("findStale ignores keys whose detected value still matches", () => {
    const led = applyConfirmations({ version: 1, values: {} }, [{ key: "backend.orm", value: null }], "human", "t");
    expect(findStale(led, { "backend.orm": null })).toEqual([]);
  });
});

describe("confirm pair parsing (D1)", () => {
  it("coerces JSON values (null, numbers, strings)", () => {
    expect(parseConfirmPair("backend.orm=null")).toEqual({ key: "backend.orm", value: null });
    expect(parseConfirmPair('backend.testCommand="go test ./..."')).toEqual({ key: "backend.testCommand", value: "go test ./..." });
    expect(parseConfirmPair("x.count=3")).toEqual({ key: "x.count", value: 3 });
  });

  it("keeps a non-JSON value as a raw string", () => {
    expect(parseConfirmPair("backend.framework=echo")).toEqual({ key: "backend.framework", value: "echo" });
  });

  it("rejects a pair with no '='", () => {
    expect(() => parseConfirmPair("nope")).toThrow(/key=value/);
  });
});
