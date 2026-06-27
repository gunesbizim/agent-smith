/**
 * Unit tests for src/cli/init-steps/llm-step.ts
 *
 * Asserts orchestration: llm=false or dryRun causes early return; generateSkills called
 * correctly; writeMarker called with result data; renderSkillsReport called on result.report;
 * summary logged on result.summary; warn shown when not ran.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../../adapt/llm-skills.js", () => ({
  generateSkills: vi.fn(),
  GENERATED_SKILLS: ["docs-backend", "docs-frontend", "test-backend"],
}));

vi.mock("../../adapt/skill-gen-marker.js", () => ({
  writeMarker: vi.fn(),
}));

vi.mock("../../cli/skills-report.js", () => ({
  renderSkillsReport: vi.fn(),
}));

vi.mock("ora", () => {
  const spinner = {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: "",
  };
  return { default: vi.fn(() => spinner) };
});

// ── Imports ────────────────────────────────────────────────────────────────

import { runLlmStep } from "../../cli/init-steps/llm-step.js";
import { generateSkills, GENERATED_SKILLS } from "../../adapt/llm-skills.js";
import { writeMarker } from "../../adapt/skill-gen-marker.js";
import { renderSkillsReport } from "../../cli/skills-report.js";

const mockGenerateSkills = vi.mocked(generateSkills);
const mockWriteMarker = vi.mocked(writeMarker);
const mockRenderSkillsReport = vi.mocked(renderSkillsReport);

// ── Fixtures ───────────────────────────────────────────────────────────────

const BASE_OPTS = {
  targetDir: "/tmp/test-llm",
  agentSmithVersion: "1.0.0",
  stackLabel: "TypeScript / Express",
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("runLlmStep", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns immediately when llm=false, skips generateSkills", async () => {
    await runLlmStep({ ...BASE_OPTS, llm: false });

    expect(mockGenerateSkills).not.toHaveBeenCalled();
    expect(mockWriteMarker).not.toHaveBeenCalled();
  });

  it("returns immediately when dryRun=true, skips generateSkills", async () => {
    await runLlmStep({ ...BASE_OPTS, dryRun: true });

    expect(mockGenerateSkills).not.toHaveBeenCalled();
    expect(mockWriteMarker).not.toHaveBeenCalled();
  });

  it("returns immediately when both llm=false and dryRun=true", async () => {
    await runLlmStep({ ...BASE_OPTS, llm: false, dryRun: true });

    expect(mockGenerateSkills).not.toHaveBeenCalled();
  });

  it("calls generateSkills with correct options when llm not false and not dryRun", async () => {
    mockGenerateSkills.mockReturnValue({ ran: false, reason: "claude unavailable" });

    await runLlmStep({ ...BASE_OPTS });

    expect(mockGenerateSkills).toHaveBeenCalledWith(BASE_OPTS.targetDir, {
      useProjectMcp: true,
      suppressHooks: true,
      regen: undefined,
    });
  });

  it("passes regenSkills as regen to generateSkills", async () => {
    mockGenerateSkills.mockReturnValue({ ran: false, reason: "no claude" });

    await runLlmStep({ ...BASE_OPTS, regenSkills: true });

    expect(mockGenerateSkills).toHaveBeenCalledWith(BASE_OPTS.targetDir, {
      useProjectMcp: true,
      suppressHooks: true,
      regen: true,
    });
  });

  it("calls writeMarker when ran=true", async () => {
    mockGenerateSkills.mockReturnValue({
      ran: true,
      promptHash: "abc123",
    });

    await runLlmStep({ ...BASE_OPTS });

    expect(mockWriteMarker).toHaveBeenCalledWith(BASE_OPTS.targetDir, {
      generatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), // ISO timestamp
      stack: BASE_OPTS.stackLabel,
      skills: GENERATED_SKILLS,
      promptHash: "abc123",
      agentSmithVersion: BASE_OPTS.agentSmithVersion,
    });
  });

  it("calls renderSkillsReport when result has a report", async () => {
    const mockReport = {
      stack: "TypeScript",
      bestPracticesDoc: "docs/arch.md",
      skills: [{ name: "test-backend", path: "/skills/test-backend/SKILL.md", rewritten: true, recommendedPractices: 3 }],
    };
    mockGenerateSkills.mockReturnValue({
      ran: true,
      promptHash: "xyz",
      report: mockReport,
    });

    await runLlmStep({ ...BASE_OPTS });

    expect(mockRenderSkillsReport).toHaveBeenCalledWith(mockReport);
  });

  it("does NOT call renderSkillsReport when result has no report", async () => {
    mockGenerateSkills.mockReturnValue({
      ran: true,
      promptHash: "xyz",
      summary: "Skills generated",
    });

    await runLlmStep({ ...BASE_OPTS });

    expect(mockRenderSkillsReport).not.toHaveBeenCalled();
  });

  it("logs summary to console when report is absent but summary is provided", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mockGenerateSkills.mockReturnValue({
      ran: true,
      promptHash: "xyz",
      summary: "3 skills generated",
    });

    await runLlmStep({ ...BASE_OPTS });

    const calls = logSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => s.includes("3 skills generated"))).toBe(true);
    logSpy.mockRestore();
  });

  it("does NOT call writeMarker when ran=false", async () => {
    mockGenerateSkills.mockReturnValue({
      ran: false,
      reason: "claude not available",
    });

    await runLlmStep({ ...BASE_OPTS });

    expect(mockWriteMarker).not.toHaveBeenCalled();
  });

  it("does NOT call renderSkillsReport when ran=false", async () => {
    mockGenerateSkills.mockReturnValue({
      ran: false,
      reason: "claude not available",
    });

    await runLlmStep({ ...BASE_OPTS });

    expect(mockRenderSkillsReport).not.toHaveBeenCalled();
  });

  it("does not throw when ran=true but summary and report are both absent", async () => {
    mockGenerateSkills.mockReturnValue({
      ran: true,
      promptHash: "hash",
    });

    await expect(runLlmStep({ ...BASE_OPTS })).resolves.toBeUndefined();
  });
});
