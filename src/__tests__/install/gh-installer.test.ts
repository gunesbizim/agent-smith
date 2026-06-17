import { describe, it, expect, vi } from "vitest";
import { pickGhInstallCommand, ensureGhCli, runGh } from "../../install/gh-installer.js";

describe("pickGhInstallCommand", () => {
  const has = (...present: string[]) => (cmd: string) => present.includes(cmd);

  it("uses Homebrew on macOS when brew is present", () => {
    expect(pickGhInstallCommand("darwin", has("brew"))).toEqual({ cmd: "brew", args: ["install", "gh"] });
  });

  it("returns null on macOS without brew (no sudo fallback)", () => {
    expect(pickGhInstallCommand("darwin", has())).toBeNull();
  });

  it("prefers winget on Windows", () => {
    expect(pickGhInstallCommand("win32", has("winget", "choco"))).toEqual({
      cmd: "winget",
      args: ["install", "--id", "GitHub.cli", "-e", "--source", "winget"],
    });
  });

  it("falls back to choco on Windows when winget is absent", () => {
    expect(pickGhInstallCommand("win32", has("choco"))).toEqual({ cmd: "choco", args: ["install", "gh", "-y"] });
  });

  it("returns null on Windows with neither winget nor choco", () => {
    expect(pickGhInstallCommand("win32", has())).toBeNull();
  });

  it("uses Homebrew on Linux when present, never sudo package managers", () => {
    expect(pickGhInstallCommand("linux", has("brew", "apt-get"))).toEqual({ cmd: "brew", args: ["install", "gh"] });
    // No brew → no auto-install (we refuse sudo to avoid a password-prompt hang).
    expect(pickGhInstallCommand("linux", has("apt-get", "dnf"))).toBeNull();
  });
});

describe("ensureGhCli", () => {
  // A package manager that exists on every platform so pickGhInstallCommand is non-null.
  const pmPresent = (cmd: string) => cmd === "brew" || cmd === "winget";

  it("reports alreadyPresent when gh is on PATH", async () => {
    const res = await ensureGhCli({ has: () => true });
    expect(res).toEqual({ available: true, alreadyPresent: true, installed: false, skipped: false });
  });

  it("skips with a manual hint when gh is absent and no installer is available", async () => {
    const res = await ensureGhCli({ has: () => false, run: async () => false });
    expect(res.available).toBe(false);
    expect(res.skipped).toBe(true);
    expect(res.reason).toBeTruthy();
  });

  it("installs gh when a package manager is available and the install succeeds", async () => {
    let ghReady = false;
    const has = (cmd: string) => (cmd === "gh" ? ghReady : pmPresent(cmd));
    const run = vi.fn(async () => { ghReady = true; return true; });
    const res = await ensureGhCli({ has, run });
    expect(run).toHaveBeenCalled();
    expect(res).toEqual({ available: true, alreadyPresent: false, installed: true, skipped: false });
  });

  it("skips with a failure hint when the install command fails", async () => {
    const has = (cmd: string) => (cmd === "gh" ? false : pmPresent(cmd));
    const res = await ensureGhCli({ has, run: async () => false });
    expect(res.installed).toBe(false);
    expect(res.skipped).toBe(true);
    expect(res.reason).toContain("failed");
  });
});

describe("runGh (real spawn)", () => {
  it("returns true for a succeeding command", async () => {
    expect(await runGh("node", ["--version"])).toBe(true);
  });
  it("returns false for a non-zero exit", async () => {
    expect(await runGh("node", ["-e", "process.exit(1)"])).toBe(false);
  });
  it("returns false when the binary does not exist", async () => {
    expect(await runGh("a-binary-that-does-not-exist-xyz123", [])).toBe(false);
  });
});
