// Stack evidence collector — gathers raw, language-agnostic EVIDENCE about a
// project by collecting the project's OWN declared files (manifests, lockfiles,
// CI/build-script configs). It does NOT interpret them: a later LLM pass (with a
// deterministic fallback) reasons over this bundle. The job here is to COLLECT,
// not to decide.
import path from "node:path";
import fs from "fs-extra";
import type { StackEvidence, EvidenceFile } from "./stack-types.js";

/** Max chars kept per collected file; longer files are truncated with a marker. */
const MAX_FILE_CHARS = 20_000;
const TRUNCATION_MARKER = "\n... [truncated by agent-smith stack-evidence] ...\n";

/** Directories we never descend into — build output, deps, VCS internals. */
const IGNORE_DIRS = [
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  ".git",
  ".venv",
];

const IGNORE_GLOBS = IGNORE_DIRS.map((d) => `**/${d}/**`);

/**
 * Build manifests + lockfiles across ALL modules (multi-module aware). These are
 * the project's own declarations of language, dependencies, and toolchain. Globbed
 * recursively so monorepos / multi-module builds are covered, not just the root.
 */
const MANIFEST_GLOBS = [
  "**/pom.xml",
  "**/build.gradle",
  "**/build.gradle.kts",
  "**/settings.gradle",
  "**/settings.gradle.kts",
  "**/package.json",
  "**/go.mod",
  "**/Cargo.toml",
  "**/pyproject.toml",
  "**/requirements*.txt",
  "**/setup.cfg",
  "**/Gemfile",
  "**/composer.json",
  "**/*.csproj",
  "**/*.sln",
  "**/mix.exs",
  "**/pubspec.yaml",
];

/**
 * CI / build-script files. These declare the project's REAL commands (test, lint,
 * build, release) — the most reliable source for toolchain commands downstream.
 */
const CI_GLOBS = [
  ".github/workflows/*.yml",
  ".github/workflows/*.yaml",
  "**/.gitlab-ci.yml",
  "**/Makefile",
  "**/makefile",
  "**/justfile",
  "**/Justfile",
  "**/tox.ini",
  "**/.pre-commit-config.yaml",
  "**/Taskfile.yml",
];

/**
 * Gather raw, language-agnostic stack evidence: the project's own manifest and CI
 * files, collected verbatim. Never throws on a missing or unreadable file — it is
 * skipped. GitNexus structural signal is left null in this first version.
 */
export async function gatherStackEvidence(rootPath: string): Promise<StackEvidence> {
  const [manifests, ciFiles] = await Promise.all([
    collectFiles(rootPath, MANIFEST_GLOBS),
    collectFiles(rootPath, CI_GLOBS),
  ]);

  // A future version can populate GitNexusEvidence (topImports, supertypes,
  // clusters) by querying an installed + indexed GitNexus — via its CLI or MCP.
  // It must stay best-effort and OPTIONAL: GitNexus may not be installed, so this
  // step must never block or throw. For now we return null when it is absent.
  return {
    rootPath,
    manifests,
    ciFiles,
    gitnexus: null,
  };
}

/**
 * Glob the given patterns under rootPath (ignoring build/dep/VCS dirs), read each
 * match, and return de-duplicated EvidenceFile[] with repo-relative paths. Any file
 * that cannot be read is skipped silently.
 */
async function collectFiles(rootPath: string, patterns: string[]): Promise<EvidenceFile[]> {
  let matches: string[];
  try {
    const { glob } = await import("tinyglobby");
    matches = await glob(patterns, {
      cwd: rootPath,
      absolute: true,
      ignore: IGNORE_GLOBS,
      dot: true,
    });
  } catch {
    return [];
  }

  // De-duplicate (overlapping patterns can match the same file).
  const unique = Array.from(new Set(matches));

  const files: EvidenceFile[] = [];
  for (const absPath of unique) {
    const evidence = await readEvidenceFile(rootPath, absPath);
    if (evidence) files.push(evidence);
  }

  // Stable order so callers/snapshots are deterministic.
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

/** Read a single file as evidence, truncating oversize content. Returns null on error. */
async function readEvidenceFile(rootPath: string, absPath: string): Promise<EvidenceFile | null> {
  let content: string;
  try {
    content = await fs.readFile(absPath, "utf-8");
  } catch {
    return null;
  }

  content = content.replaceAll("\r\n", "\n"); // normalize line endings cross-platform
  if (content.length > MAX_FILE_CHARS) {
    content = content.slice(0, MAX_FILE_CHARS) + TRUNCATION_MARKER;
  }

  // Repo-relative, POSIX-style path so evidence refs are portable.
  const relPath = path.relative(rootPath, absPath).split(path.sep).join("/");
  return { path: relPath, content };
}
