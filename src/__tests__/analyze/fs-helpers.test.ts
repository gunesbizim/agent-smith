// fs-helpers tests (B10): the per-run cache must return results identical to a fresh,
// uncached read — caching is an I/O optimization, never a behavior change.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import {
  createFsCache,
  readJson,
  readFileSafe,
  fileExists,
  grepFirst,
  pkgDeps,
  findSubPackages,
  findAllPackageJsons,
} from "../../analyze/fs-helpers.js";

let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-helpers-test-"));
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ dependencies: { express: "^4" }, devDependencies: { typescript: "^5" } }));
  await fs.writeFile(path.join(dir, "go.mod"), "module x\r\ngo 1.22\r\n"); // CRLF to verify normalization
  await fs.ensureDir(path.join(dir, "apps", "api"));
  await fs.writeFile(path.join(dir, "apps", "api", "package.json"), JSON.stringify({ dependencies: { hono: "^4" } }));
  await fs.writeFile(path.join(dir, "main.py"), "from fastapi import FastAPI");
});

afterAll(async () => { await fs.remove(dir); });

describe("fs-helpers", () => {
  it("readJson cached == uncached", async () => {
    const c = createFsCache();
    const a = await readJson(dir, "package.json", c);
    const b = await readJson(dir, "package.json", c); // cache hit
    const fresh = await readJson(dir, "package.json", createFsCache());
    expect(a).toEqual(fresh);
    expect(b).toEqual(fresh);
  });

  it("readFileSafe normalizes CRLF and caches identically", async () => {
    const c = createFsCache();
    const a = await readFileSafe(dir, "go.mod", c);
    const b = await readFileSafe(dir, "go.mod", c);
    expect(a).toBe("module x\ngo 1.22\n");
    expect(b).toBe(a);
  });

  it("fileExists handles plain and glob patterns", async () => {
    const c = createFsCache();
    expect(await fileExists(dir, "go.mod", c)).toBe(true);
    expect(await fileExists(dir, "**/main.py", c)).toBe(true);
    expect(await fileExists(dir, "nope.txt", c)).toBe(false);
  });

  it("grepFirst supports pipe alternation", async () => {
    const c = createFsCache();
    expect(await grepFirst(dir, "**/main.py", "FastAPI|fastapi", c)).toBe(true);
    expect(await grepFirst(dir, "**/main.py", "Django", c)).toBe(false);
  });

  it("pkgDeps merges dependencies and devDependencies", () => {
    expect(pkgDeps({ dependencies: { a: "1" }, devDependencies: { b: "2" } })).toEqual({ a: "1", b: "2" });
  });

  it("findSubPackages + findAllPackageJsons discover monorepo packages", async () => {
    const c = createFsCache();
    const subs = await findSubPackages(dir, c);
    expect(subs.some((s) => s.endsWith(path.join("apps", "api")))).toBe(true);
    const pkgs = await findAllPackageJsons(dir, c);
    expect(pkgs).toHaveLength(2); // root + apps/api
  });
});
