import { describe, it, expect } from "vitest";
import os from "node:os";
import { runMcpIndexing, runInDir } from "../../install/mcp-indexer.js";

describe("runMcpIndexing", () => {
  it("runs the indexCommand for installed servers that declare one (gitnexus, git-memory)", async () => {
    const ran: { command: string; cwd: string }[] = [];
    const summary = await runMcpIndexing(
      "/proj",
      { project: null },
      {
        showProgress: false,
        check: async () => true, // all binaries present
        run: async (command, cwd) => {
          ran.push({ command, cwd });
        },
      },
    );
    expect(summary.indexed).toEqual(expect.arrayContaining(["gitnexus", "git-memory"]));
    expect(summary.failed).toEqual([]);
    // Runs in the project dir, using the real index commands.
    expect(ran.every((r) => r.cwd === "/proj")).toBe(true);
    expect(ran.find((r) => r.command.startsWith("gitnexus analyze"))).toBeTruthy();
    expect(ran.find((r) => r.command.startsWith("git-memory index"))).toBeTruthy();
  });

  it("skips servers whose binary is not installed (best-effort, never throws)", async () => {
    const summary = await runMcpIndexing(
      "/proj",
      { project: null },
      { showProgress: false, check: async () => false, run: async () => { throw new Error("should not run"); } },
    );
    expect(summary.indexed).toEqual([]);
    expect(summary.skipped.map((s) => s.name)).toEqual(expect.arrayContaining(["gitnexus", "git-memory"]));
    expect(summary.skipped.every((s) => s.reason === "binary not installed")).toBe(true);
  });

  it("records a failing scan without throwing", async () => {
    const summary = await runMcpIndexing(
      "/proj",
      { project: null },
      {
        showProgress: false,
        check: async () => true,
        run: async (command) => {
          if (command.startsWith("gitnexus")) throw new Error("analyze blew up");
        },
      },
    );
    expect(summary.failed.map((f) => f.name)).toContain("gitnexus");
    expect(summary.indexed).toContain("git-memory");
  });

  it("renders spinners + summary footer when showProgress is on (indexed + failed branches)", async () => {
    const summary = await runMcpIndexing(
      "/proj",
      { project: null },
      {
        showProgress: true,
        check: async () => true,
        run: async (command) => {
          if (command.startsWith("git-memory")) throw new Error("nope");
        },
      },
    );
    expect(summary.indexed).toContain("gitnexus");
    expect(summary.failed.map((f) => f.name)).toContain("git-memory");
  });

  it("renders the skipped branch of the summary when binaries are absent", async () => {
    const summary = await runMcpIndexing(
      "/proj",
      { project: null },
      { showProgress: true, check: async () => false, run: async () => undefined },
    );
    expect(summary.skipped.length).toBeGreaterThan(0);
  });
});

describe("runInDir", () => {
  it("resolves when the command exits 0", async () => {
    await expect(runInDir(`node -e "process.exit(0)"`, os.tmpdir())).resolves.toBeUndefined();
  });

  it("rejects when the command exits non-zero", async () => {
    await expect(runInDir(`node -e "process.exit(3)"`, os.tmpdir())).rejects.toThrow();
  });
});
