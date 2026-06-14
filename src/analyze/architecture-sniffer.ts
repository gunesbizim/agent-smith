// Architecture sniffer — detect project conventions and patterns
import path from "node:path";
import { execSync } from "node:child_process";
import fs from "fs-extra";
import type { DetectedProject } from "../shared/types.js";

// ----- Sentrux probe -----

export interface SentruxProbeResult {
  available: boolean;
  cycles: number | null;
  maxCC: number | null;
  couplingGrade: string | null;
  qualitySignal: number | null;
  bottleneck: string | null;
}

/**
 * Run `sentrux scan <rootPath>` and parse root_causes.
 * Returns { available: false, ... } on any failure (binary missing, scan error, parse error).
 */
export async function probeSentrux(rootPath: string): Promise<SentruxProbeResult> {
  const empty: SentruxProbeResult = {
    available: false,
    cycles: null,
    maxCC: null,
    couplingGrade: null,
    qualitySignal: null,
    bottleneck: null,
  };

  try {
    const stdout = execSync("sentrux scan", {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 30_000,
      cwd: rootPath,
    }).toString("utf-8").trim();

    // sentrux scan may print JSONL (one object per line) or a single JSON object.
    // Find the last line that parses as valid JSON.
    const lines = stdout.split("\n").filter(Boolean);
    let parsed: Record<string, unknown> | null = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        parsed = JSON.parse(lines[i]) as Record<string, unknown>;
        break;
      } catch {
        // keep looking
      }
    }
    if (!parsed) return empty;

    const rc = parsed["root_causes"] as Record<string, { score: number; raw: number }> | undefined;
    if (!rc) return empty;

    const cycles = typeof rc["acyclicity"]?.raw === "number" ? rc["acyclicity"].raw : null;
    const equalityRaw = typeof rc["equality"]?.raw === "number" ? rc["equality"].raw : null;
    const modularityRaw = typeof rc["modularity"]?.raw === "number" ? rc["modularity"].raw : null;
    const qualitySignal = typeof parsed["quality_signal"] === "number"
      ? (parsed["quality_signal"] as number)
      : null;
    const bottleneck = typeof parsed["bottleneck"] === "string"
      ? (parsed["bottleneck"] as string)
      : null;

    // Derive maxCC from equality.raw (Gini coefficient of cyclomatic complexity).
    // Gini 0.0-0.2 => CC threshold 10, 0.2-0.4 => 15, 0.4-0.6 => 20, >0.6 => 25
    let maxCC: number | null = null;
    if (equalityRaw !== null) {
      if (equalityRaw <= 0.2) maxCC = 10;
      else if (equalityRaw <= 0.4) maxCC = 15;
      else if (equalityRaw <= 0.6) maxCC = 20;
      else maxCC = 25;
    }

    // Derive coupling grade from modularity.raw (Newman Q).
    // Q >= 0.6 => A, 0.4-0.6 => B, 0.2-0.4 => C, 0.0-0.2 => D, < 0 => F
    let couplingGrade: string | null = null;
    if (modularityRaw !== null) {
      if (modularityRaw >= 0.6) couplingGrade = "A";
      else if (modularityRaw >= 0.4) couplingGrade = "B";
      else if (modularityRaw >= 0.2) couplingGrade = "C";
      else if (modularityRaw >= 0.0) couplingGrade = "D";
      else couplingGrade = "F";
    }

    return { available: true, cycles, maxCC, couplingGrade, qualitySignal, bottleneck };
  } catch {
    return empty;
  }
}

export interface ArchitecturePattern {
  name: string;
  category: "structure" | "convention" | "testing" | "security" | "logging";
  description: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
}

export async function sniffArchitecture(
  _rootPath: string,
  project: DetectedProject,
): Promise<ArchitecturePattern[]> {
  const patterns: ArchitecturePattern[] = [];

  if (project.backend) {
    patterns.push(...(await sniffBackendPatterns(project.rootPath, project)));
  }

  if (project.frontend) {
    patterns.push(...(await sniffFrontendPatterns(project.rootPath, project)));
  }

  return patterns;
}

async function sniffBackendPatterns(
  rootPath: string,
  project: DetectedProject,
): Promise<ArchitecturePattern[]> {
  const patterns: ArchitecturePattern[] = [];
  const backend = project.backend!;

  // Hexagonal architecture
  if (backend.hasHexagonalArch) {
    patterns.push({
      name: "hexagonal-architecture",
      category: "structure",
      description: "Project follows hexagonal/ports-and-adapters architecture with views → services → repositories layering",
      evidence: ["services.py and repositories.py found", "ports/ directory with ABCs"],
      confidence: "high",
    });
  }

  // Service/repo split
  if (backend.hasServiceRepo) {
    patterns.push({
      name: "service-repository-pattern",
      category: "structure",
      description: "Business logic in services, data access in repositories",
      evidence: ["services.py", "repositories.py"],
      confidence: "high",
    });
  }

  // APIView convention
  if (backend.usesAPIView && !backend.usesFunctionViews) {
    patterns.push({
      name: "class-based-views-only",
      category: "convention",
      description: "Only APIView subclasses used — no function-based views",
      evidence: ["APIView subclasses found", "No @api_view decorators found"],
      confidence: "high",
    });
  }

  // Role decorators
  if (backend.rolePattern === "decorators") {
    patterns.push({
      name: "role-decorator-auth",
      category: "security",
      description: "Role-based access control via decorators on view classes — fail-closed",
      evidence: ["@requires_role, @requires_any_role, @requires_public decorators found"],
      confidence: "high",
    });
  }

  // Absolute imports
  if (backend.importStyle === "absolute") {
    patterns.push({
      name: "absolute-imports",
      category: "convention",
      description: "All imports use absolute paths (from apps.X import Y)",
      evidence: ["from apps.* imports found", "No relative imports (from .) found"],
      confidence: "medium",
    });
  }

  // Structured logging
  if (backend.loggingPattern === "structured") {
    patterns.push({
      name: "structured-logging",
      category: "logging",
      description: "Logger calls include canonical keys (trace_id, span_id, user_id, action)",
      evidence: ["logger.* calls with extra dict", "Canonical log keys found"],
      confidence: "medium",
    });
  }

  // Django-specific patterns
  if (backend.framework === "django") {
    // Check for encrypted fields (PII)
    const hasEncryptedField = await grepInFiles(rootPath, "**/*.py", "EncryptedField");
    if (hasEncryptedField) {
      patterns.push({
        name: "pii-encryption",
        category: "security",
        description: "PII fields use EncryptedField (AES-GCM) — never stored in plaintext",
        evidence: ["EncryptedField usage found"],
        confidence: "medium",
      });
    }

    // Check for DRF spectacular
    const hasSpectacular = await grepInFiles(rootPath, "**/*.py", "drf_spectacular");
    if (hasSpectacular) {
      patterns.push({
        name: "openapi-annotations",
        category: "convention",
        description: "API endpoints annotated with drf-spectacular @extend_schema",
        evidence: ["drf_spectacular imports found"],
        confidence: "medium",
      });
    }

    // Check for IMMUTABLE audit tables
    const hasImmutableAudit = await grepInFiles(rootPath, "**/*.py", "DENY UPDATE|DENY DELETE");
    if (hasImmutableAudit) {
      patterns.push({
        name: "audit-immutability",
        category: "security",
        description: "Audit tables are DB-level immutable (DENY UPDATE, DELETE)",
        evidence: ["DENY UPDATE/DELETE grants found"],
        confidence: "medium",
      });
    }
  }

  return patterns;
}

async function sniffFrontendPatterns(
  rootPath: string,
  project: DetectedProject,
): Promise<ArchitecturePattern[]> {
  const patterns: ArchitecturePattern[] = [];
  const frontend = project.frontend!;

  // Composition API / script setup
  if (frontend.componentPattern === "script-setup") {
    patterns.push({
      name: "composition-api-script-setup",
      category: "convention",
      description: "All Vue components use Composition API with <script setup lang='ts'>",
      evidence: ["<script setup> blocks found"],
      confidence: "medium",
    });
  }

  // i18n
  if (frontend.usesI18n) {
    patterns.push({
      name: "internationalization",
      category: "convention",
      description: `All user-facing strings use ${frontend.i18nLibrary} — no hardcoded text`,
      evidence: [`${frontend.i18nLibrary} usage found`],
      confidence: "medium",
    });
  }

  // TypeScript
  if (frontend.usesTypeScript) {
    patterns.push({
      name: "typescript-strict",
      category: "convention",
      description: "TypeScript with strict mode — no implicit any",
      evidence: ["tsconfig.json with strict: true", "TypeScript files found"],
      confidence: "high",
    });
  }

  // Pinia store pattern
  if (frontend.stateManagement === "Pinia") {
    patterns.push({
      name: "pinia-store-layering",
      category: "structure",
      description: "Pinia stores never call backend directly — always through api/ layer",
      evidence: ["Pinia stores found", "api/ directory with Axios wrappers"],
      confidence: "medium",
    });
  }

  // Vuetify
  if (frontend.uiLibrary === "Vuetify 3") {
    patterns.push({
      name: "vuetify-design-system",
      category: "convention",
      description: "All UI uses Vuetify 3 components — no custom CSS duplicating Vuetify utilities",
      evidence: ["Vuetify 3 dependency found", "vuetify.ts plugin found"],
      confidence: "medium",
    });
  }

  return patterns;
}

// Helper: grep across files
async function grepInFiles(root: string, glob: string, pattern: string): Promise<boolean> {
  try {
    const { glob: globFn } = await import("tinyglobby");
    const matches = await globFn([glob], { cwd: root, absolute: true, ignore: ["node_modules/**", ".git/**"] });
    for (const file of matches.slice(0, 10)) {
      const content = await fs.readFile(file, "utf-8");
      if (content.includes(pattern)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
