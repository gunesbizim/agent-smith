// C4 — programmatic detection of the engineering conventions a project ALREADY follows.
//
// "Respect what the project already does" must be first-class and verifiable, not solely the
// model's judgment. This module scans the real tree for concrete, checkable conventions, each
// cited with the evidence paths that prove it. The result seeds the "Followed" half of
// best-practices.md (works offline) and is handed to the LLM generator as facts to enforce.
//
// best-practices.md "Followed" is a D1 artifact: once a human confirms/edits a convention it
// becomes ground truth the next run reads instead of re-detecting (see D1). Detected-but-
// unconfirmed conventions are candidates for `agent-smith confirm`.
import path from "node:path";
import fs from "fs-extra";
import type { DetectedProject } from "../shared/types.js";

export interface Convention {
  /** Stable id, e.g. "layered-architecture". */
  id: string;
  /** Human label for the "Followed" bucket. */
  name: string;
  /** Repo-relative paths that evidence the convention. */
  evidence: string[];
  confidence: "high" | "medium" | "low";
}

// Directory names that signal a layered structure, keyed by the layer they represent.
const LAYER_DIRS: Record<string, string[]> = {
  services: ["services", "service"],
  repositories: ["repositories", "repository", "repos", "repo", "dao"],
  controllers: ["controllers", "controller", "handlers", "views", "routes"],
};

const TYPED_BOUNDARY_DIRS = ["dto", "dtos", "schemas", "schema", "serializers", "serializer", "types"];
const TEST_DIRS = ["tests", "test", "__tests__", "spec"];
const TEST_FIXTURE_FILES = ["conftest.py", "factories.py", "factory.py"];

// Recurse the tree collecting directory base-names and a sample of file paths, skipping noise.
async function walk(root: string, maxEntries = 4000): Promise<{ dirs: Set<string>; files: string[] }> {
  const dirs = new Set<string>();
  const files: string[] = [];
  const ignore = new Set(["node_modules", ".git", "dist", "build", "target", ".venv", "vendor", ".next", "coverage"]);
  const stack = [root];
  let seen = 0;
  while (stack.length && seen < maxEntries) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      seen++;
      if (seen >= maxEntries) break;
      if (e.name.startsWith(".") && e.name !== ".github") continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (ignore.has(e.name)) continue;
        dirs.add(e.name.toLowerCase());
        stack.push(full);
      } else {
        files.push(path.relative(root, full));
      }
    }
  }
  return { dirs, files };
}

function hasAnyDir(dirs: Set<string>, names: string[]): string | null {
  for (const n of names) if (dirs.has(n)) return n;
  return null;
}

/**
 * Detect concrete, evidence-cited conventions the project already follows. Pure read-only scan.
 */
export async function detectConventions(rootPath: string, project: DetectedProject): Promise<Convention[]> {
  const conventions: Convention[] = [];
  const { dirs, files } = await walk(rootPath);

  // 1. Layered architecture — at least two of {services, repositories, controllers} present.
  const layerHits = Object.entries(LAYER_DIRS)
    .map(([layer, names]) => ({ layer, dir: hasAnyDir(dirs, names) }))
    .filter((h) => h.dir);
  if (layerHits.length >= 2) {
    conventions.push({
      id: "layered-architecture",
      name: "Layered architecture (separation of " + layerHits.map((h) => h.layer).join(" / ") + ")",
      evidence: layerHits.map((h) => `${h.dir}/`),
      confidence: layerHits.length >= 3 ? "high" : "medium",
    });
  }

  // 2. Typed API boundaries — DTO / schema / serializer directories.
  const boundaryDir = hasAnyDir(dirs, TYPED_BOUNDARY_DIRS);
  if (boundaryDir) {
    conventions.push({
      id: "typed-api-boundaries",
      name: "Typed API boundaries (DTOs / schemas / serializers)",
      evidence: [`${boundaryDir}/`],
      confidence: "medium",
    });
  }

  // 3. Structured logging — a structured logger dependency on the backend.
  const orm = project.backend?.loggingPattern;
  if (orm === "structured") {
    conventions.push({
      id: "structured-logging",
      name: "Structured logging",
      evidence: ["detected logging pattern: structured"],
      confidence: "medium",
    });
  }

  // 4. Test conventions — a tests dir and/or fixture/factory files.
  const testDir = hasAnyDir(dirs, TEST_DIRS);
  const fixtureFile = files.find((f) => TEST_FIXTURE_FILES.includes(path.basename(f)));
  if (testDir || fixtureFile) {
    const evidence = [testDir ? `${testDir}/` : null, fixtureFile].filter(Boolean) as string[];
    conventions.push({
      id: "test-suite",
      name: fixtureFile ? "Test suite with shared fixtures/factories" : "Dedicated test suite",
      evidence,
      confidence: fixtureFile ? "high" : "medium",
    });
  }

  // 5. Fail-closed auth — a real auth method was detected.
  const auth = project.backend?.authMethod;
  if (auth && auth !== "none" && auth !== "unknown") {
    conventions.push({
      id: "enforced-auth",
      name: `Enforced authentication (${auth})`,
      evidence: [`detected auth method: ${auth}`],
      confidence: "medium",
    });
  }

  return conventions;
}

/** Render the detected conventions as the "Followed" bullet list for best-practices.md (C4). */
export function renderFollowedConventions(conventions: Convention[]): string {
  if (conventions.length === 0) {
    return "_No conventions auto-detected — confirm the project's standards with `agent-smith confirm`._";
  }
  return conventions
    .map((c) => `- **${c.name}** — evidence: ${c.evidence.join(", ")} _(confidence: ${c.confidence})_`)
    .join("\n");
}
