// Architecture sniffer — detect project conventions and patterns
import { spawnSync } from "node:child_process";
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
 * Run `sentrux check <rootPath>` and parse quality score from text output.
 * Returns { available: false, ... } on any failure (binary missing, scan error, no output).
 * `check` exits 0 (no violations) or 1 (violations) — both cases output a Quality score line.
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
    const result = spawnSync("sentrux", ["check", rootPath], { // NOSONAR — fixed binary, no shell
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15_000,
      encoding: "utf-8",
    });
    if (result.error) return empty; // binary not found
    const combined = (result.stdout ?? "") + (result.stderr ?? "");
    const qMatch = /Quality:\s*(\d+)/.exec(combined);
    if (!qMatch) return empty;
    return { available: true, cycles: null, maxCC: null, couplingGrade: null, qualitySignal: Number.parseInt(qMatch[1], 10), bottleneck: null };
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
