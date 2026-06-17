// A2 — cognitive/execution boundary fitness function.
//
// The invariant: the cognitive layer (src/analyze/**) produces FACTS only and never mutates
// disk; mutation lives exclusively in the execution layers (adapt/scaffold/install). This is a
// structural guard that can actually fail — add an fs write under src/analyze and it goes red.
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const analyzeDir = path.join(repoRoot, "src", "analyze");

// Mutating fs / process calls that write or delete state. Reads (readFile, readJson, statSync,
// existsSync, readdir) are allowed — the cognitive layer may inspect the repo freely.
const WRITE_CALLS = [
  /\bfs\.writeFile\b/, /\bfs\.writeFileSync\b/, /\bfs\.writeJson\b/, /\bfs\.writeJsonSync\b/,
  /\bfs\.outputFile\b/, /\bfs\.ensureDir\b/, /\bfs\.ensureDirSync\b/, /\bfs\.mkdir\b/,
  /\bfs\.mkdirSync\b/, /\bfs\.remove\b/, /\bfs\.removeSync\b/, /\bfs\.rm\b/, /\bfs\.rmSync\b/,
  /\bfs\.copy\b/, /\bfs\.move\b/, /\bfs\.emptyDir\b/, /\bfs\.appendFile\b/,
];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...tsFiles(p));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("layering fitness function (A2)", () => {
  it("no module under src/analyze/** writes or mutates PROJECT state", () => {
    const offenders: string[] = [];
    for (const file of tsFiles(analyzeDir)) {
      const src = fs.readFileSync(file, "utf-8");
      // Exemption: a "runner" module that creates a private OS temp scratch dir via mkdtemp may
      // clean up THAT scratch (never the project). Such files are infra, not pure detectors.
      const ownsScratch = /mkdtemp(Sync)?\b/.test(src);
      for (const re of WRITE_CALLS) {
        if (!re.test(src)) continue;
        // mkdtemp owners are only allowed cleanup ops (remove/rm), not project writes.
        if (ownsScratch && /remove|rm\b|rmSync/.test(re.source)) continue;
        offenders.push(`${path.relative(repoRoot, file)} :: ${re.source}`);
      }
    }
    expect(offenders, `cognitive layer must not mutate project state:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("scans a non-trivial number of analyze modules (guard is actually looking)", () => {
    expect(tsFiles(analyzeDir).length).toBeGreaterThan(5);
  });
});
