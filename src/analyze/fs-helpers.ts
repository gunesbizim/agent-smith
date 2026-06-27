// Shared filesystem helpers for the analyze layer.
//
// These were previously duplicated across project-detector.ts and package-scanner.ts
// (B10). Consolidated here with a small per-run directory-walk cache so a single
// detectProject()/scanPackages() pass does not re-glob or re-read the same files
// repeatedly. Behavior is identical to the prior inline implementations.
import path from "node:path";
import fs from "fs-extra";

// ---- Per-run cache ----
//
// Keyed by absolute path. We memoize the three expensive primitives a detection
// run repeats most: glob lookups, file reads, and subpackage directory walks.
// Caches are scoped to a run so stale results never leak between projects; the
// default module-level cache is keyed by absolute path (callers pass distinct
// roots), and tests/long-lived processes can pass a fresh cache explicitly.
export interface FsCache {
  glob: Map<string, Promise<string[]>>;
  file: Map<string, Promise<string | null>>;
  json: Map<string, Promise<Record<string, unknown> | null>>;
  subPackages: Map<string, Promise<string[]>>;
}

export function createFsCache(): FsCache {
  return { glob: new Map(), file: new Map(), json: new Map(), subPackages: new Map() };
}

// A process-wide default cache. Keys are absolute paths, so distinct project roots
// never collide. Detection runs against fresh temp dirs (tests) or distinct repos
// (real use) get distinct keys, preserving correctness while cutting redundant I/O
// within a single run.
const defaultCache = createFsCache();

const IGNORE = ["node_modules/**", ".git/**", "**/vendor/**"];

// ---- Glob ----

async function globMatches(root: string, pattern: string, cache: FsCache): Promise<string[]> {
  const key = `${root}\0${pattern}`;
  const hit = cache.glob.get(key);
  if (hit) return hit;
  const p = (async () => {
    try {
      const { glob } = await import("tinyglobby");
      const patterns = [pattern];
      // If pattern uses **/ prefix, also try without it (for root-level files)
      if (pattern.startsWith("**/")) patterns.push(pattern.slice(3));
      return await glob(patterns, { cwd: root, absolute: true, ignore: IGNORE });
    } catch { return []; }
  })();
  cache.glob.set(key, p);
  return p;
}

export async function findFile(root: string, pattern: string, cache: FsCache = defaultCache): Promise<string | null> {
  const matches = await globMatches(root, pattern, cache);
  return matches.length > 0 ? matches[0] : null;
}

export async function fileExists(root: string, pattern: string, cache: FsCache = defaultCache): Promise<boolean> {
  // For simple filenames (no glob chars), try direct path first
  if (!pattern.includes("*") && !pattern.includes("?")) {
    const simple = pattern.replace(/^\*\*\//, ""); // strip **/ prefix for direct check
    try { if (await fs.pathExists(path.join(root, simple))) return true; } catch {}
  }
  return (await findFile(root, pattern, cache)) !== null;
}

// ---- File reads ----

async function readAbsFile(absPath: string, cache: FsCache): Promise<string | null> {
  const hit = cache.file.get(absPath);
  if (hit) return hit;
  const p = (async () => {
    try {
      const content = await fs.readFile(absPath, "utf-8");
      return content.replaceAll("\r\n", "\n"); // normalize line endings cross-platform
    } catch { return null; }
  })();
  cache.file.set(absPath, p);
  return p;
}

export async function readFirstFile(root: string, pattern: string, cache: FsCache = defaultCache): Promise<string | null> {
  const f = await findFile(root, pattern, cache);
  if (!f) return null;
  return readAbsFile(f, cache);
}

export async function readFileSafe(root: string, relativePath: string, cache: FsCache = defaultCache): Promise<string | null> {
  // If path contains glob wildcards, locate it first
  if (relativePath.includes("*") || relativePath.includes("?")) {
    return readFirstFile(root, relativePath, cache);
  }
  return readAbsFile(path.join(root, relativePath), cache);
}

export async function readJson(root: string, relativePath: string, cache: FsCache = defaultCache): Promise<Record<string, unknown> | null> {
  const absPath = path.join(root, relativePath);
  const hit = cache.json.get(absPath);
  if (hit) return hit;
  const p = (async () => {
    try { return (await fs.readJson(absPath)) as Record<string, unknown>; } catch { return null; }
  })();
  cache.json.set(absPath, p);
  return p;
}

// ---- Content grep ----

function contentMatches(content: string, pattern: string): boolean {
  if (!pattern) return true;
  // Support pipe-separated alternation: "FastAPI|fastapi" matches either
  return pattern.split("|").some((alt) => content.includes(alt));
}

export async function grepFirst(root: string, filePattern: string, contentPattern: string, cache: FsCache = defaultCache): Promise<boolean> {
  const matches = await globMatches(root, filePattern, cache);
  for (const file of matches.slice(0, 5)) {
    const content = await readAbsFile(file, cache);
    if (content !== null && contentMatches(content, contentPattern)) return true;
  }
  return false;
}

// ---- Directory predicates ----

export async function dirExists(dirPath: string): Promise<boolean> {
  try { return (await fs.stat(dirPath)).isDirectory(); } catch { return false; }
}

// ---- Package.json helper ----

export function pkgDeps(pkg: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(pkg.dependencies as Record<string, unknown> | undefined),
    ...(pkg.devDependencies as Record<string, unknown> | undefined),
  };
}

// ---- Monorepo subpackage discovery ----

// Find all immediate subdirectories under common monorepo roots (apps/packages/services/libs).
export async function findSubPackages(rootPath: string, cache: FsCache = defaultCache): Promise<string[]> {
  const hit = cache.subPackages.get(rootPath);
  if (hit) return hit;
  const p = (async () => {
    const dirs: string[] = [];
    for (const subdir of ["apps", "packages", "services", "libs"]) {
      const subPath = path.join(rootPath, subdir);
      try {
        if (await fs.pathExists(subPath)) {
          const entries = await fs.readdir(subPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              dirs.push(path.join(subPath, entry.name));
            }
          }
        }
      } catch {}
    }
    return dirs;
  })();
  cache.subPackages.set(rootPath, p);
  return p;
}

// Collect all package.json contents from root + monorepo subdirs.
export async function findAllPackageJsons(rootPath: string, cache: FsCache = defaultCache): Promise<Record<string, unknown>[]> {
  const pkgs: Record<string, unknown>[] = [];
  const rootPkg = await readJson(rootPath, "package.json", cache);
  if (rootPkg) pkgs.push(rootPkg);
  const subDirs = await findSubPackages(rootPath, cache);
  for (const subDir of subDirs) {
    const pj = await readJson(subDir, "package.json", cache);
    if (pj) pkgs.push(pj);
  }
  return pkgs;
}
