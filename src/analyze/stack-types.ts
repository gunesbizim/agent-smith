// Shared contract for evidence-driven stack detection.
//
// The detection pipeline is: gather raw EVIDENCE (language-agnostic — just the
// project's own declared files) → synthesize a StackProfile (LLM pass, with a
// deterministic manifest fallback) → map into TemplateVariables. No per-language
// branching decides the stack; we read what the project itself declares.

/** A single project file collected verbatim as evidence (manifest, lockfile, CI). */
export interface EvidenceFile {
  /** Repo-relative path, e.g. "backend/pom.xml" or ".github/workflows/ci.yml". */
  path: string;
  /** Raw file contents (may be truncated for very large files). */
  content: string;
}

/**
 * Structural signal mined from a GitNexus index when one is available. GitNexus is
 * a code-structure graph (symbols + IMPORTS/EXTENDS/IMPLEMENTS) — it does NOT label
 * frameworks/ORMs, so we surface raw signal the synthesizer reasons over.
 */
export interface GitNexusEvidence {
  /** Most frequent external import prefixes, e.g. "org.springframework.boot", "jakarta.persistence". */
  topImports: string[];
  /** Notable supertypes from EXTENDS/IMPLEMENTS edges, e.g. "JpaRepository", "OncePerRequestFilter". */
  supertypes: string[];
  /** Functional clusters with cohesion, for architecture labelling. */
  clusters: { name: string; cohesion: number }[];
}

/** The full evidence bundle handed to the synthesizer. Every field is best-effort. */
export interface StackEvidence {
  rootPath: string;
  /** Build manifests + lockfiles across ALL modules (multi-module aware). */
  manifests: EvidenceFile[];
  /** CI configs, Makefile, justfile, tox.ini, etc. — the project's REAL commands. */
  ciFiles: EvidenceFile[];
  /** GitNexus structural signal, or null when not installed/indexed. */
  gitnexus: GitNexusEvidence | null;
}

/** Toolchain commands. `null` means "not determined" (emit honest "none" downstream). */
export interface StackCommands {
  test: string | null;
  lint: string | null;
  format: string | null;
  typecheck: string | null;
  migrate: string | null;
}

/**
 * Synthesized stack facts. Produced either by the LLM pass or the deterministic
 * manifest fallback. Unknown fields are null/empty — they must NEVER be silently
 * filled with a default stack's values.
 */
export interface StackProfile {
  language: string | null;          // e.g. "java"
  languageVersion: string;          // parsed real version, or ""
  framework: string | null;         // e.g. "spring-boot"
  frameworkDetail: string;          // human label, e.g. "Spring Boot 3 + Spring Web"
  orm: string | null;               // e.g. "JPA/Hibernate"
  dbEngine: string | null;          // e.g. "postgresql"
  authMethod: string | null;        // e.g. "Spring Security"
  roleModel: string;                // description, e.g. "@PreAuthorize / hasRole(...)"; "none" if absent
  roleValues: string;               // concrete role values ONLY if evidenced; else "none"
  importStyle: "absolute" | "relative" | "mixed";
  loggingPattern: "structured" | "unstructured";
  commands: StackCommands;
  confidence: number;               // 0..1
  evidenceRefs: string[];           // file paths that supported the call
  source: "llm" | "manifest-fallback";
}
