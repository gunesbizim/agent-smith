import { describe, it, expect } from "vitest";
import { pickGhInstallCommand } from "../../install/gh-installer.js";

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

  it("uses Homebrew on Linux when present, never sudo package managers", () => {
    expect(pickGhInstallCommand("linux", has("brew", "apt-get"))).toEqual({ cmd: "brew", args: ["install", "gh"] });
    // No brew → no auto-install (we refuse sudo to avoid a password-prompt hang).
    expect(pickGhInstallCommand("linux", has("apt-get", "dnf"))).toBeNull();
  });
});
