// Golden-output guardrail: run the evidence → synthesizer → mapper pipeline against fixture
// stacks and assert the generated template variables carry the RIGHT commands and — for every
// non-Python stack — ZERO Python tooling. This single suite catches the headline class of bug
// (Django/Python defaults leaking onto Java/Go/Node projects) and guards every future change.
//
// Uses the deterministic synthesizer path (useLlm:false) so it is fast and stable in CI.
import { describe, it, expect } from "vitest";
import { synthesizeStackProfile } from "../../analyze/stack-synthesizer.js";
import { mapBestPractices } from "../../analyze/best-practice-mapper.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";
import type { StackEvidence, EvidenceFile } from "../../analyze/stack-types.js";
import type { DetectedProject, TemplateVariables } from "../../shared/types.js";

function evidence(manifests: EvidenceFile[], ciFiles: EvidenceFile[] = []): StackEvidence {
  return { rootPath: "/fixture", manifests, ciFiles, gitnexus: null };
}

// A bare DetectedProject with NO backend — this is the worst case for leakage: the heuristic
// detector found nothing, so only the StackProfile can supply (or fail to supply) the stack.
function bareProject(): DetectedProject {
  return {
    rootPath: "/fixture", projectType: "web-app", backend: null, frontend: null,
    testing: { backend: null, frontend: null }, linting: { backend: null, frontend: null },
    cicd: null, monorepo: null, database: null,
  };
}

function mapFor(ev: StackEvidence): TemplateVariables {
  const profile = synthesizeStackProfile(ev, { useLlm: false });
  return mapBestPractices(bareProject(), [], DEFAULT_TEMPLATE_VARS, undefined, profile);
}

const PYTHON_TOOLING = ["ruff", "pytest", "mypy", "manage.py", "python ", "config.settings"];

function assertNoPythonTooling(vars: TemplateVariables) {
  const cmdFields = [
    vars.BACKEND_TEST_CMD, vars.BACKEND_LINT_CMD, vars.BACKEND_FORMAT_CMD,
    vars.BACKEND_TYPE_CHECK_CMD, vars.BACKEND_MIGRATE_CMD, vars.BACKEND_SETTINGS_MODULE,
    vars.PRE_PUSH_GATES, vars.API_DOCS_LIBRARY,
  ].join(" | ");
  for (const needle of PYTHON_TOOLING) {
    expect(cmdFields, `python tooling "${needle}" leaked: ${cmdFields}`).not.toContain(needle);
  }
}

describe("golden stack output", () => {
  it("Spring Boot / Maven — Java tooling, JPA, Postgres, no Python", () => {
    const pom = `<project>
      <properties><java.version>17</java.version></properties>
      <dependencies>
        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>
        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-security</artifactId></dependency>
        <dependency><groupId>org.postgresql</groupId><artifactId>postgresql</artifactId></dependency>
        <dependency><groupId>org.flywaydb</groupId><artifactId>flyway-core</artifactId></dependency>
      </dependencies>
      <build><plugins><plugin><artifactId>spotless-maven-plugin</artifactId></plugin></plugins></build>
    </project>`;
    const vars = mapFor(evidence([{ path: "pom.xml", content: pom }]));

    expect(vars.BACKEND_LANG).toBe("Java 17");
    expect(vars.BACKEND_FRAMEWORK.toLowerCase()).toContain("spring");
    expect(vars.ORM).toBe("JPA/Hibernate");
    expect(vars.DB_ENGINE).toBe("postgresql");
    expect(vars.AUTH_METHOD).toBe("Spring Security");
    expect(vars.BACKEND_TEST_CMD).toBe("mvn test");
    expect(vars.BACKEND_FORMAT_CMD).toBe("mvn spotless:apply");
    expect(vars.BACKEND_MIGRATE_CMD).toBe("mvn flyway:migrate");
    // The reported bug: roles must NOT be the Django legal-app example values.
    expect(vars.ROLE_VALID_VALUES).not.toContain("lawyer");
    assertNoPythonTooling(vars);
  });

  it("Spring Boot / Gradle Kotlin — Kotlin tooling, no Python", () => {
    const gradle = `plugins { kotlin("jvm") version "1.9" }
      java { sourceCompatibility = JavaLanguageVersion.of(21) }
      dependencies {
        implementation("org.springframework.boot:spring-boot-starter-web")
        implementation("org.springframework.boot:spring-boot-starter-data-jpa")
        runtimeOnly("org.postgresql:postgresql")
        implementation("com.pinterest:ktlint")
      }`;
    const vars = mapFor(evidence([{ path: "build.gradle.kts", content: gradle }]));

    expect(vars.BACKEND_LANG.toLowerCase()).toContain("kotlin");
    expect(vars.ORM).toBe("JPA/Hibernate");
    expect(vars.BACKEND_TEST_CMD).toBe("./gradlew test");
    expect(vars.BACKEND_LINT_CMD).toBe("./gradlew ktlintCheck");
    assertNoPythonTooling(vars);
  });

  it("Go / Echo — Go tooling, no Python", () => {
    const goMod = `module example.com/api
go 1.22
require (
  github.com/labstack/echo/v4 v4.11.0
  gorm.io/gorm v1.25.0
  github.com/jackc/pgx/v5 v5.5.0
  go.uber.org/zap v1.26.0
)`;
    const vars = mapFor(evidence([{ path: "go.mod", content: goMod }]));

    expect(vars.BACKEND_LANG).toBe("Go 1.22");
    expect(vars.BACKEND_FRAMEWORK.toLowerCase()).toContain("echo");
    expect(vars.ORM).toBe("GORM");
    expect(vars.DB_ENGINE).toBe("postgresql");
    expect(vars.BACKEND_TEST_CMD).toBe("go test ./...");
    expect(vars.BACKEND_LINT_CMD).toBe("golangci-lint run");
    assertNoPythonTooling(vars);
  });

  it("NestJS — Node tooling, no Python", () => {
    const pkg = JSON.stringify({
      dependencies: { "@nestjs/core": "^10.0.0", "@prisma/client": "^5.0.0", pg: "^8.0.0" },
      devDependencies: { typescript: "^5.0.0", prisma: "^5.0.0" },
      scripts: { test: "jest", lint: "eslint .", build: "nest build" },
    });
    const vars = mapFor(evidence([{ path: "package.json", content: pkg }]));

    expect(vars.BACKEND_LANG.toLowerCase()).toContain("typescript");
    expect(vars.BACKEND_FRAMEWORK.toLowerCase()).toContain("nestjs");
    expect(vars.ORM).toBe("Prisma");
    expect(vars.BACKEND_TEST_CMD).toBe("npm run test");
    expect(vars.BACKEND_MIGRATE_CMD).toBe("npx prisma migrate deploy");
    assertNoPythonTooling(vars);
  });

  it("Django — positive control: Python tooling IS correct here", () => {
    const pyproject = `[tool.poetry.dependencies]
django = "^5.0"
djangorestframework = "*"
psycopg = "*"
[tool.ruff]
[tool.pytest.ini_options]`;
    const vars = mapFor(evidence([{ path: "pyproject.toml", content: pyproject }]));

    expect(vars.BACKEND_LANG.toLowerCase()).toContain("python");
    expect(vars.BACKEND_FRAMEWORK.toLowerCase()).toContain("django");
    expect(vars.ORM).toBe("Django ORM");
    expect(vars.BACKEND_TEST_CMD).toBe("pytest");
    expect(vars.BACKEND_LINT_CMD).toBe("ruff check .");
    expect(vars.BACKEND_MIGRATE_CMD).toContain("manage.py");
  });

  it("Unknown stack — honest 'none', never a borrowed default", () => {
    const vars = mapFor(evidence([{ path: "README.md", content: "# just docs" }]));
    expect(vars.BACKEND_LANG).toBe("none");
    expect(vars.BACKEND_FRAMEWORK).toBe("none");
    assertNoPythonTooling(vars);
  });
});
