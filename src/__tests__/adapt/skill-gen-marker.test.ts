// P3 — first-run skill-generation marker.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { markerPath, readMarker, writeMarker } from "../../adapt/skill-gen-marker.js";

describe("skill-gen-marker (P3)", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "marker-")); });
  afterEach(() => { fs.removeSync(tmp); });

  it("markerPath points inside .claude/.agent-smith", () => {
    expect(markerPath(tmp)).toBe(path.join(tmp, ".claude", ".agent-smith", "skills-generated.json"));
  });

  it("readMarker returns null when absent", () => {
    expect(readMarker(tmp)).toBeNull();
  });

  it("round-trips a written marker", () => {
    writeMarker(tmp, { generatedAt: "2026-06-17T00:00:00.000Z", stack: "go/echo", skills: ["test-backend"] });
    const m = readMarker(tmp);
    expect(m?.stack).toBe("go/echo");
    expect(m?.skills).toEqual(["test-backend"]);
  });

  it("readMarker returns null on a corrupt file rather than throwing", () => {
    const file = markerPath(tmp);
    fs.ensureDirSync(path.dirname(file));
    fs.writeFileSync(file, "{ not json");
    expect(readMarker(tmp)).toBeNull();
  });
});
