// Integration test for `analyze` — exercises the evidence→synthesis wiring and both the
// --json and human-readable report paths against a real temp Spring project (deterministic,
// no `claude`). Guards that the synthesized stack reaches the output and no Python leaks.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { analyzeCommand } from "../../cli/analyze.js";

describe("analyzeCommand", () => {
  let tmp: string;
  let cwd: string;
  let logs: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-smith-analyze-"));
    fs.writeFileSync(
      path.join(tmp, "pom.xml"),
      "<project><properties><java.version>17</java.version></properties><dependencies>" +
        "<dependency><artifactId>spring-boot-starter-web</artifactId></dependency>" +
        "<dependency><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>" +
        "<dependency><artifactId>postgresql</artifactId></dependency></dependencies></project>",
    );
    cwd = process.cwd();
    process.chdir(tmp);
    logs = [];
    logSpy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { logs.push(a.join(" ")); });
  });

  afterEach(() => {
    logSpy.mockRestore();
    process.chdir(cwd);
    fs.removeSync(tmp);
  });

  it("--json emits a synthesized Java/Spring stackProfile with no Python tooling", async () => {
    await analyzeCommand({ json: true });
    const out = logs.join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.stackProfile.language).toBe("java");
    expect(parsed.stackProfile.framework).toContain("spring");
    expect(parsed.templateVariables.BACKEND_TEST_CMD).toBe("mvn test");
    expect(parsed.templateVariables.ORM).toBe("JPA/Hibernate");
    expect(out).not.toContain("ruff");
    expect(out).not.toContain("manage.py");
  });

  it("text report prints the synthesized Stack section", async () => {
    await analyzeCommand({});
    const out = logs.join("\n");
    expect(out).toContain("Stack (synthesized");
    expect(out).toContain("mvn test");
  });
});
