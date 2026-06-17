// P4 — skills report: sentinel parse, filesystem cross-check, terminal render.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { parseSkillsReport, crossCheckReport } from "../../adapt/llm-skills.js";
import { renderSkillsReport } from "../../cli/skills-report.js";

const VALID_BLOCK = `Some prose the model wrote first.
<<<AGENT_SMITH_SKILLS_REPORT
{
  "stack": "Go 1.22 / Echo",
  "skills": [
    { "name": "pr-review-backend", "path": ".claude/skills/pr-review-backend/SKILL.md", "rewritten": true, "recommendedPractices": 3 },
    { "name": "test-backend", "path": ".claude/skills/test-backend/SKILL.md", "rewritten": true, "recommendedPractices": 2 }
  ],
  "bestPracticesDoc": "docs/architecture/best-practices.md",
  "notes": "no frontend"
}
AGENT_SMITH_SKILLS_REPORT>>>
trailing prose`;

describe("parseSkillsReport (P4)", () => {
  it("extracts the typed report from sentinel-fenced stdout", () => {
    const r = parseSkillsReport(VALID_BLOCK);
    expect(r).not.toBeNull();
    expect(r!.stack).toBe("Go 1.22 / Echo");
    expect(r!.skills).toHaveLength(2);
    expect(r!.skills[0].name).toBe("pr-review-backend");
    expect(r!.skills[0].recommendedPractices).toBe(3);
    expect(r!.bestPracticesDoc).toBe("docs/architecture/best-practices.md");
  });

  it("returns null when there is no sentinel block", () => {
    expect(parseSkillsReport("just a one-line summary, no block")).toBeNull();
  });

  it("returns null on malformed JSON inside the sentinels", () => {
    expect(parseSkillsReport("<<<AGENT_SMITH_SKILLS_REPORT\n{ not json\nAGENT_SMITH_SKILLS_REPORT>>>")).toBeNull();
  });
});

describe("crossCheckReport (P4)", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "report-")); });
  afterEach(() => { fs.removeSync(tmp); });

  it("downgrades a 'rewritten' skill whose file still contains a {{ placeholder", () => {
    const rel = ".claude/skills/pr-review-backend/SKILL.md";
    const file = path.join(tmp, rel);
    fs.ensureDirSync(path.dirname(file));
    fs.writeFileSync(file, "Framework: {{BACKEND_FRAMEWORK}}\n"); // still a stub
    const report = { stack: "x", skills: [{ name: "pr-review-backend", path: rel, rewritten: true, recommendedPractices: 1 }] };
    const checked = crossCheckReport(report, tmp);
    expect(checked.skills[0].rewritten).toBe(false);
  });

  it("downgrades a 'rewritten' skill whose file is missing", () => {
    const report = { stack: "x", skills: [{ name: "gone", path: ".claude/skills/gone/SKILL.md", rewritten: true, recommendedPractices: 0 }] };
    expect(crossCheckReport(report, tmp).skills[0].rewritten).toBe(false);
  });

  it("keeps a genuinely-rewritten skill (file present, no placeholder)", () => {
    const rel = ".claude/skills/test-backend/SKILL.md";
    const file = path.join(tmp, rel);
    fs.ensureDirSync(path.dirname(file));
    fs.writeFileSync(file, "---\nname: test-backend\n---\n" +
      "You write backend tests for this Go/Echo service. Run the suite with `go test ./...` and " +
      "lint with `golangci-lint run`. Cover happy, error, and edge paths; no empty stubs. Use the " +
      "project's real fixtures and table-driven tests, grounded in the actual repository layout.\n");
    const report = { stack: "x", skills: [{ name: "test-backend", path: rel, rewritten: true, recommendedPractices: 2 }] };
    expect(crossCheckReport(report, tmp).skills[0].rewritten).toBe(true);
  });
});

describe("renderSkillsReport (P4)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let out: string;
  beforeEach(() => {
    out = "";
    logSpy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { out += a.join(" ") + "\n"; });
  });
  afterEach(() => logSpy.mockRestore());

  it("prints every skill name, the stack, and the totals", () => {
    renderSkillsReport({
      stack: "Go 1.22 / Echo",
      skills: [
        { name: "pr-review-backend", path: "p", rewritten: true, recommendedPractices: 3 },
        { name: "test-backend", path: "p", rewritten: false, recommendedPractices: 0 },
      ],
      notes: "no frontend",
    });
    expect(out).toContain("Go 1.22 / Echo");
    expect(out).toContain("pr-review-backend");
    expect(out).toContain("test-backend");
    expect(out).toContain("1/2 skills rewritten");
    expect(out).toContain("no frontend");
  });
});
