// Regression tests for the five issues found by the 0.9.0 local end-to-end test (→ 0.9.1).
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { shouldSkipInterview } from "../../cli/init.js";
import { commandSucceeds } from "../../install/mcp-installer.js";
import { detectionEnv } from "../../shared/exec-env.js";
import { synthesizeStackProfile } from "../../analyze/stack-synthesizer.js";
import type { StackEvidence, EvidenceFile } from "../../analyze/stack-types.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ev = (manifests: EvidenceFile[]): StackEvidence => ({ rootPath: "/fx", manifests, ciFiles: [], gitnexus: null });

describe("#1 — bin is executable (npx/npm exec can link it)", () => {
  // The POSIX executable bit doesn't exist on Windows (NTFS/git-on-Windows don't represent it, so
  // `mode & 0o111` is always 0); npm links bins via .cmd/.ps1 shims there regardless. Skip on win32.
  it.skipIf(process.platform === "win32")("bin/agent-smith.js has the executable bit", () => {
    const mode = fs.statSync(path.join(repoRoot, "bin", "agent-smith.js")).mode;
    expect(mode & 0o111, "bin/agent-smith.js must be executable (chmod +x)").not.toBe(0);
  });
});

describe("#2 — --no-interview is honored", () => {
  it("Commander's interview:false skips the interview", () => {
    expect(shouldSkipInterview({ interview: false })).toBe(true);
  });
  it("--auto, --dry-run, and direct noInterview also skip", () => {
    expect(shouldSkipInterview({ auto: true })).toBe(true);
    expect(shouldSkipInterview({ dryRun: true })).toBe(true);
    expect(shouldSkipInterview({ noInterview: true })).toBe(true);
  });
  it("default (interactive) does NOT skip", () => {
    expect(shouldSkipInterview({})).toBe(false);
  });
});

describe("#3/#5 — PATH-robust tool detection", () => {
  it("detectionEnv prepends common bin dirs to PATH", () => {
    const env = detectionEnv({ PATH: "/usr/bin" });
    expect(env.PATH).toContain("/opt/homebrew/bin");
    expect(env.PATH!.endsWith("/usr/bin")).toBe(true); // existing PATH preserved (last)
  });
  it("commandSucceeds normalizes a bare token to a presence check (finds node)", async () => {
    expect(await commandSucceeds("node")).toBe(true);
    expect(await commandSucceeds("definitely-not-a-real-binary-zzz")).toBe(false);
  });
});

describe("#4 — Node CLI/library language is detected (no more 'stack none')", () => {
  it("a TS CLI (commander, no backend framework) → language typescript, framework null", () => {
    const pkg = JSON.stringify({ bin: { x: "b.js" }, dependencies: { commander: "^12" }, devDependencies: { typescript: "^5", vitest: "^1" }, scripts: { test: "vitest run" } });
    const p = synthesizeStackProfile(ev([{ path: "package.json", content: pkg }]), { useLlm: false });
    expect(p.language).toBe("typescript");
    expect(p.framework).toBeNull();
    expect(p.commands.test).toBe("npm run test");
  });
  it("a Django project that also has package.json is still detected as Python (not shadowed)", () => {
    const py = "[tool.poetry.dependencies]\ndjango = '^5'\n[tool.pytest.ini_options]\n";
    const pkg = JSON.stringify({ devDependencies: { vite: "^5", typescript: "^5" } });
    const p = synthesizeStackProfile(ev([{ path: "pyproject.toml", content: py }, { path: "package.json", content: pkg }]), { useLlm: false });
    expect(p.language).toBe("python");
  });
});
