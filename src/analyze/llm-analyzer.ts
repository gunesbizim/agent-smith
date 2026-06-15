// Hybrid LLM analysis — opt-in refinement of the programmatic detector.
//
// agent-smith's detection is heuristic and file-pattern based. For unusual or
// polyglot repos those heuristics can misclassify. When the user opts in (--llm),
// and the `claude` CLI is on PATH, we gather the project's manifest files and ask
// Claude (headless) to classify the stack, then merge it OVER the programmatic result.
//
// We feed the evidence INLINE and disable Claude's tools, forcing a single-turn text
// answer. Letting `claude -p` use Read/Glob/Grep turns it into a multi-minute agentic
// loop (one model round-trip per file) — far too slow for an interactive `init`.
//
// This is strictly best-effort: any failure (no claude binary, timeout, unparseable
// output, schema mismatch) falls back silently to the programmatic DetectedProject.
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import type {
  DetectedProject,
  BackendInfo,
  BackendFramework,
  FrontendInfo,
  FrontendFramework,
  ProjectType,
} from "../shared/types.js";

// What we ask the model to emit. Deliberately small — only the high-value fields
// that drive skill customization and MCP selection. Exported for testing.
export interface LlmStack {
  projectType?: ProjectType;
  backend?: {
    framework?: string;
    language?: string;
    languageVersion?: string;
    orm?: string | null;
  } | null;
  frontend?: {
    framework?: string;
    uiLibrary?: string | null;
    usesTypeScript?: boolean;
  } | null;
}

const CLAUDE_TIMEOUT_MS = 90_000;

// Manifest / config files that reveal the stack. Read inline so the model needs no tools.
const EVIDENCE_FILES = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "setup.cfg",
  "go.mod",
  "Cargo.toml",
  "composer.json",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "pubspec.yaml",
  "Package.swift",
  "plugin.json",
  ".mcp.json",
];

const PER_FILE_CHARS = 4_000;
const TOTAL_EVIDENCE_CHARS = 16_000;

// Is the `claude` CLI available to shell out to?
export function isClaudeAvailable(): boolean {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore", timeout: 10_000 }); // NOSONAR — fixed binary, no shell, no user input
    return true;
  } catch {
    return false;
  }
}

// Collect a compact evidence bundle: a shallow top-level listing plus the contents of any
// present manifest files, each truncated, with an overall cap. Exported for testing.
export function gatherEvidence(cwd: string): string {
  const parts: string[] = [];

  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true })
      .filter((e) => !e.name.startsWith(".") || e.name === ".github")
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    parts.push(`Top-level entries: ${entries.slice(0, 60).join(", ")}`);
  } catch { /* ignore */ }

  let budget = TOTAL_EVIDENCE_CHARS;
  for (const file of EVIDENCE_FILES) {
    if (budget <= 0) break;
    try {
      const full = path.join(cwd, file);
      if (!fs.existsSync(full)) continue;
      const raw = fs.readFileSync(full, "utf-8");
      const slice = raw.slice(0, Math.min(PER_FILE_CHARS, budget));
      budget -= slice.length;
      parts.push(`\n--- ${file} ---\n${slice}`);
    } catch { /* ignore unreadable files */ }
  }

  return parts.join("\n");
}

function buildPrompt(programmatic: DetectedProject, evidence: string): string {
  const heuristic = JSON.stringify({
    projectType: programmatic.projectType,
    backend: programmatic.backend?.framework ?? null,
    frontend: programmatic.frontend?.framework ?? null,
  });
  return [
    "Classify a software project's tech stack from the manifest files provided below.",
    "Do NOT use any tools — everything you need is in the EVIDENCE section.",
    `A heuristic scanner produced this (it may be wrong): ${heuristic}.`,
    "",
    "Respond with ONE line of minified JSON and NOTHING else — no prose, no markdown fences.",
    "Schema (use null when a side genuinely does not exist):",
    '{"projectType":"web-app|cli-tool|library|monorepo|unknown",',
    '"backend":{"framework":string,"language":string,"languageVersion":string,"orm":string|null}|null,',
    '"frontend":{"framework":string,"uiLibrary":string|null,"usesTypeScript":boolean}|null}',
    "",
    "Rules: a CLI tool or library has backend=null and frontend=null unless it genuinely",
    "serves HTTP or renders UI. Do not invent a stack that is not present in the evidence.",
    "",
    "=== EVIDENCE ===",
    evidence,
  ].join("\n");
}

// Pull the first balanced top-level JSON object out of arbitrary CLI output.
// Exported for testing.
export function extractJsonObject(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// Run the headless claude call and return the parsed descriptor, or null on any failure.
function runClaudeAnalysis(cwd: string, programmatic: DetectedProject): LlmStack | null {
  try {
    const prompt = buildPrompt(programmatic, gatherEvidence(cwd));
    // Spawn OUTSIDE the project directory. The evidence is inline, so the model needs no
    // access to the repo — and running `claude` inside a configured project boots its
    // SessionStart hooks (and MCP servers), which can hang for minutes. A temp cwd plus an
    // empty strict MCP config keeps startup to the bare model round-trip (~25s).
    const out = execFileSync( // NOSONAR — fixed binary, no shell, no user input in argv
      "claude",
      ["-p", prompt, "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'],
      { cwd: os.tmpdir(), encoding: "utf-8", timeout: CLAUDE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
    );
    const parsed = extractJsonObject(out);
    return parsed && typeof parsed === "object" ? (parsed as LlmStack) : null;
  } catch {
    return null;
  }
}

// Merge an LLM descriptor over the programmatic result. The programmatic structures are
// the base; LLM values override only the fields it confidently provides, so we never lose
// the richer heuristic detail (role pattern, auth, etc.) when the LLM omits it.
// Exported for testing.
export function mergeStack(programmatic: DetectedProject, llm: LlmStack): DetectedProject {
  const merged: DetectedProject = { ...programmatic };

  if (typeof llm.projectType === "string") {
    merged.projectType = llm.projectType;
  }

  if (llm.backend === null) {
    merged.backend = null;
  } else if (llm.backend && typeof llm.backend.framework === "string") {
    const base: BackendInfo = programmatic.backend ?? {
      framework: "unknown",
      language: "typescript",
      languageVersion: "",
      hasHexagonalArch: false,
      hasServiceRepo: false,
      usesAPIView: false,
      usesFunctionViews: true,
      importStyle: "absolute",
      rolePattern: "none",
      authMethod: "none",
      loggingPattern: "unstructured",
      orm: null,
    };
    merged.backend = {
      ...base,
      framework: llm.backend.framework as BackendFramework,
      language: (llm.backend.language as BackendInfo["language"]) ?? base.language,
      languageVersion: llm.backend.languageVersion ?? base.languageVersion,
      orm: llm.backend.orm === undefined ? base.orm : llm.backend.orm,
    };
  }

  if (llm.frontend === null) {
    merged.frontend = null;
  } else if (llm.frontend && typeof llm.frontend.framework === "string") {
    const base: FrontendInfo = programmatic.frontend ?? {
      framework: "react",
      componentPattern: "unknown",
      uiLibrary: null,
      stateManagement: null,
      usesI18n: false,
      i18nLibrary: null,
      usesTypeScript: false,
      roleAwareUI: false,
    };
    merged.frontend = {
      ...base,
      framework: llm.frontend.framework as FrontendFramework,
      uiLibrary: llm.frontend.uiLibrary === undefined ? base.uiLibrary : llm.frontend.uiLibrary,
      usesTypeScript: llm.frontend.usesTypeScript ?? base.usesTypeScript,
    };
  }

  return merged;
}

export interface LlmRefineResult {
  project: DetectedProject;
  usedLlm: boolean;
  reason?: string;
}

// Refine the programmatic detection with an opt-in LLM pass. Always returns a usable
// project — falls back to the programmatic result when the LLM path is unavailable.
export function refineWithLlm(cwd: string, programmatic: DetectedProject): LlmRefineResult {
  if (!isClaudeAvailable()) {
    return { project: programmatic, usedLlm: false, reason: "claude CLI not found on PATH" };
  }
  const llm = runClaudeAnalysis(cwd, programmatic);
  if (!llm) {
    return { project: programmatic, usedLlm: false, reason: "LLM analysis failed or returned no usable JSON" };
  }
  return { project: mergeStack(programmatic, llm), usedLlm: true };
}
