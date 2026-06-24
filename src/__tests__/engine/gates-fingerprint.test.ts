import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfirm, shouldPause } from "../../engine/gates.js";
import { treeFingerprint } from "../../engine/fingerprint.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("shouldPause", () => {
  it("never pauses under 'none'", () => {
    expect(shouldPause("understand", "none")).toBe(false);
    expect(shouldPause("code", "none")).toBe(false);
  });
  it("pauses before every phase under 'all'", () => {
    expect(shouldPause("understand", "all")).toBe(true);
    expect(shouldPause("pr", "all")).toBe(true);
  });
  it("pauses only before CODE under 'plan'", () => {
    expect(shouldPause("code", "plan")).toBe(true);
    expect(shouldPause("understand", "plan")).toBe(false);
    expect(shouldPause("review", "plan")).toBe(false);
  });
});

describe("defaultConfirm", () => {
  const original = process.stdin.isTTY;
  afterEach(() => {
    process.stdin.isTTY = original;
  });
  it("returns false (pause) when not attached to a TTY", async () => {
    process.stdin.isTTY = false;
    await expect(defaultConfirm("code")).resolves.toBe(false);
  });
});

describe("treeFingerprint", () => {
  it("produces a 64-char hex digest for a git working tree", () => {
    expect(treeFingerprint(repoRoot)).toMatch(/^[a-f0-9]{64}$/);
  });
  it("returns a stable digest for the same tree", () => {
    expect(treeFingerprint(repoRoot)).toBe(treeFingerprint(repoRoot));
  });
});
