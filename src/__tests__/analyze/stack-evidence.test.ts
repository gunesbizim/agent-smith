import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { gatherStackEvidence } from "../../analyze/stack-evidence.js";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-smith-evidence-test-"));
});

afterAll(async () => {
  await fs.remove(tmpDir);
});

async function makeProject(name: string, files: Record<string, string>): Promise<string> {
  const dir = path.join(tmpDir, name);
  await fs.emptyDir(dir);
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content, "utf-8");
  }
  return dir;
}

describe("Stack Evidence", () => {
  it("returns empty bundle with the rootPath set and gitnexus null for an empty project", async () => {
    const dir = await makeProject("empty", {});
    const result = await gatherStackEvidence(dir);
    expect(result.rootPath).toBe(dir);
    expect(result.manifests).toEqual([]);
    expect(result.ciFiles).toEqual([]);
    expect(result.gitnexus).toBeNull();
  });

  it("collects a manifest and a CI workflow with correct relative paths", async () => {
    const dir = await makeProject("basic", {
      "pom.xml": "<project><artifactId>demo</artifactId></project>",
      ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest",
    });

    const result = await gatherStackEvidence(dir);

    const manifestPaths = result.manifests.map((f) => f.path);
    expect(manifestPaths).toContain("pom.xml");
    const pom = result.manifests.find((f) => f.path === "pom.xml");
    expect(pom?.content).toContain("artifactId");

    const ciPaths = result.ciFiles.map((f) => f.path);
    expect(ciPaths).toContain(".github/workflows/ci.yml");
    const ci = result.ciFiles.find((f) => f.path === ".github/workflows/ci.yml");
    expect(ci?.content).toContain("runs-on");

    expect(result.gitnexus).toBeNull();
  });

  it("is multi-module aware — collects manifests from nested modules", async () => {
    const dir = await makeProject("multimodule", {
      "pom.xml": "<project><modules><module>svc-a</module></modules></project>",
      "svc-a/pom.xml": "<project><artifactId>svc-a</artifactId></project>",
      "svc-b/build.gradle.kts": "plugins { java }",
      "web/package.json": JSON.stringify({ name: "web" }),
    });

    const result = await gatherStackEvidence(dir);
    const paths = result.manifests.map((f) => f.path).sort();

    expect(paths).toContain("pom.xml");
    expect(paths).toContain("svc-a/pom.xml");
    expect(paths).toContain("svc-b/build.gradle.kts");
    expect(paths).toContain("web/package.json");
  });

  it("skips node_modules, vendor, dist, build, target, and .venv directories", async () => {
    const dir = await makeProject("with-junk", {
      "package.json": JSON.stringify({ name: "app" }),
      "node_modules/some-dep/package.json": JSON.stringify({ name: "some-dep" }),
      "vendor/foo/composer.json": JSON.stringify({ name: "vendor/foo" }),
      "dist/package.json": JSON.stringify({ name: "dist-artifact" }),
      "build/build.gradle": "// generated",
      "target/pom.xml": "<project/>",
      ".venv/pyproject.toml": "[project]",
    });

    const result = await gatherStackEvidence(dir);
    const paths = result.manifests.map((f) => f.path);

    expect(paths).toEqual(["package.json"]);
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    expect(paths.some((p) => p.includes("vendor"))).toBe(false);
    expect(paths.some((p) => p.includes("dist"))).toBe(false);
    expect(paths.some((p) => p.includes("build/"))).toBe(false);
    expect(paths.some((p) => p.includes("target/"))).toBe(false);
    expect(paths.some((p) => p.includes(".venv"))).toBe(false);
  });

  it("collects CI/build-script files: Makefile, justfile, tox.ini", async () => {
    const dir = await makeProject("scripts", {
      Makefile: "test:\n\tnpm test",
      justfile: "lint:\n  eslint .",
      "tox.ini": "[tox]\nenvlist = py312",
      ".gitlab-ci.yml": "stages:\n  - test",
    });

    const result = await gatherStackEvidence(dir);
    const ciPaths = result.ciFiles.map((f) => f.path).sort();

    expect(ciPaths).toContain("Makefile");
    expect(ciPaths).toContain("justfile");
    expect(ciPaths).toContain("tox.ini");
    expect(ciPaths).toContain(".gitlab-ci.yml");
  });

  it("truncates very large files with a marker", async () => {
    const big = "x".repeat(25_000);
    const dir = await makeProject("big", {
      "package.json": big,
    });

    const result = await gatherStackEvidence(dir);
    const pkg = result.manifests.find((f) => f.path === "package.json");
    expect(pkg).toBeDefined();
    expect(pkg!.content.length).toBeLessThan(25_000);
    expect(pkg!.content).toContain("truncated");
  });
});
