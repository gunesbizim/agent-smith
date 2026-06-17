// B2 — end-to-end golden guardrail. Runs the DETERMINISTIC (no-LLM) init pipeline
// (detect → synthesize stack → map vars → scaffold → customize) against fixture repos and
// asserts the SKILL FILES ON DISK carry the right commands, no foreign tooling, no leftover
// {{...}} placeholders. This is the failure mode that shipped (Python tooling on Go/Node) and
// the substitution-ordering hazard (B8) — caught end-to-end, after scaffold+customize, which
// the synthesizer-only golden test does not exercise.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { detectProject } from "../../analyze/project-detector.js";
import { gatherAndSynthesizeStack } from "../../analyze/stack-synthesizer.js";
import { mapBestPractices } from "../../analyze/best-practice-mapper.js";
import { scaffoldCommands } from "../../scaffold/commands.js";
import { scaffoldSkills } from "../../scaffold/skills.js";
import { customizeSkills } from "../../adapt/skill-customizer.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";

let tmpRoot: string;

beforeAll(async () => { tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agent-smith-golden-")); });
afterAll(async () => { await fs.remove(tmpRoot); });

// Build a fixture repo, run the deterministic pipeline, return all generated .md content joined.
async function generateSkillsFor(name: string, files: Record<string, string>): Promise<string> {
  const dir = path.join(tmpRoot, name);
  await fs.emptyDir(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await fs.ensureDir(path.dirname(full));
    await fs.writeFile(full, content, "utf-8");
  }

  const project = await detectProject(dir);
  const profile = await gatherAndSynthesizeStack(dir, { useLlm: false });
  const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS, undefined, profile);
  await scaffoldCommands(dir, vars, false);
  await scaffoldSkills(dir, vars, false);
  await customizeSkills(dir, vars, false);

  // Concatenate every generated command + skill markdown.
  const roots = [path.join(dir, ".claude", "skills"), path.join(dir, ".claude", "commands")];
  let blob = "";
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    const stack = [r];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of await fs.readdir(cur, { withFileTypes: true })) {
        const p = path.join(cur, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.name.endsWith(".md")) blob += await fs.readFile(p, "utf-8") + "\n";
      }
    }
  }
  return blob;
}

const PYTHON_TOOLING = ["ruff", "pytest", "mypy", "manage.py", "drf-spectacular"];

function expectNoForeignTooling(blob: string) {
  for (const needle of PYTHON_TOOLING) {
    expect(blob.includes(needle), `foreign tooling "${needle}" leaked into generated skills`).toBe(false);
  }
}

function expectNoUnresolvedPlaceholders(blob: string) {
  const residual = [...blob.matchAll(/\{\{[A-Z_]+\}\}/g)].map((m) => m[0]);
  expect([...new Set(residual)], "unresolved template placeholders in generated skills").toEqual([]);
}

describe("end-to-end golden init pipeline (B2)", () => {
  it("Go / Echo → Go commands, no Python tooling, no placeholders", async () => {
    const blob = await generateSkillsFor("go-echo", {
      "go.mod": "module example.com/api\ngo 1.22\nrequire (\n  github.com/labstack/echo/v4 v4.11.0\n  gorm.io/gorm v1.25.0\n  github.com/jackc/pgx/v5 v5.5.0\n)",
    });
    expect(blob).toContain("go test ./...");
    expect(blob).toContain("golangci-lint");
    expectNoForeignTooling(blob);
    expectNoUnresolvedPlaceholders(blob);
  });

  it("Rust / Axum → Cargo commands, no Python tooling, no placeholders", async () => {
    const blob = await generateSkillsFor("rust-axum", {
      "Cargo.toml": '[package]\nname = "api"\n[dependencies]\naxum = "0.7"\ntokio = { version = "1", features = ["full"] }\nsqlx = "0.7"',
    });
    expect(blob).toContain("cargo test");
    expect(blob.toLowerCase()).toContain("clippy");
    expectNoForeignTooling(blob);
    expectNoUnresolvedPlaceholders(blob);
  });

  it("NestJS → Node commands, no Python tooling, no placeholders", async () => {
    const blob = await generateSkillsFor("nestjs", {
      "package.json": JSON.stringify({
        dependencies: { "@nestjs/core": "^10.0.0", "@prisma/client": "^5.0.0", pg: "^8.0.0" },
        devDependencies: { typescript: "^5.0.0", prisma: "^5.0.0" },
        scripts: { test: "jest", lint: "eslint .", build: "nest build" },
      }),
    });
    expect(blob.toLowerCase()).toContain("nest");
    expectNoForeignTooling(blob);
    expectNoUnresolvedPlaceholders(blob);
  });

  it("Django → Python tooling IS present here (positive control), no placeholders", async () => {
    const blob = await generateSkillsFor("django", {
      "manage.py": "#!/usr/bin/env python\nimport os",
      "pyproject.toml": "[tool.poetry.dependencies]\ndjango = '^5.0'\ndjangorestframework = '*'\n[tool.ruff]\n[tool.pytest.ini_options]\n",
      "requirements.txt": "django>=5\ndjangorestframework\npsycopg2-binary",
    });
    // The one stack where Python tooling is correct.
    expect(blob.includes("pytest") || blob.includes("ruff") || blob.includes("manage.py")).toBe(true);
    expectNoUnresolvedPlaceholders(blob);
  });
});
