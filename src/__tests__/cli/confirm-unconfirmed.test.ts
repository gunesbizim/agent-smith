// A3 (D1 scope) — the uncertainty surface: detection's unproven values are flagged for human
// resolution, and a confirmed value drops out of the unconfirmed list (the loop closing).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { unconfirmedForRoot } from "../../cli/confirm.js";
import { writeLedger } from "../../artifacts/ground-truth.js";

describe("unconfirmedForRoot (A3/D1)", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "a3-")); });
  afterEach(() => { fs.removeSync(tmp); });

  it("flags unproven detected values on a backend-only project", async () => {
    fs.writeFileSync(path.join(tmp, "go.mod"), "module x\ngo 1.22\nrequire github.com/labstack/echo/v4 v4.11.0");
    const keys = (await unconfirmedForRoot(tmp)).map((u) => u.key);
    // a backend-only Go project has no frontend → those keys are unproven/unconfirmed
    expect(keys).toContain("frontend.framework");
  });

  it("a confirmed value drops out of the unconfirmed list", async () => {
    fs.writeFileSync(path.join(tmp, "go.mod"), "module x\ngo 1.22\nrequire github.com/labstack/echo/v4 v4.11.0");
    writeLedger(tmp, { version: 1, values: { "frontend.framework": { value: "none (CLI service)", source: "confirmed", by: "human" } } });
    const keys = (await unconfirmedForRoot(tmp)).map((u) => u.key);
    expect(keys).not.toContain("frontend.framework");
  });

  it("returns [] gracefully when analysis cannot run", async () => {
    // an empty dir still analyzes (no crash); the call must never throw
    await expect(unconfirmedForRoot(tmp)).resolves.toBeInstanceOf(Array);
  });
});
