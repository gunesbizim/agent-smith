import { describe, it, expect } from "vitest";
import { cavemanCompress } from "../../adapt/caveman-compress.js";

describe("Caveman Compressor", () => {
  it("drops articles", () => {
    const result = cavemanCompress("The quick brown fox jumps over a lazy dog");
    expect(result).not.toContain("The ");
    expect(result).not.toContain(" a ");
  });

  it("preserves code blocks", () => {
    const input = "Run the command:\n```bash\nnpm install\n```\nIt is important to check the output.";
    const result = cavemanCompress(input);
    expect(result).toContain("```bash\nnpm install\n```");
    expect(result).toContain("npm install");
  });

  it("preserves inline code", () => {
    const result = cavemanCompress("Run the `npm test` command for the tests.");
    expect(result).toContain("`npm test`");
  });

  it("shortens common phrases", () => {
    expect(cavemanCompress("You should make sure that the tests pass")).toContain("Ensure");
    expect(cavemanCompress("Do not push to main")).toContain("Never");
    expect(cavemanCompress("Be sure to lint")).toContain("Always");
  });

  it("drops filler adverbs", () => {
    const result = cavemanCompress("The absolutely critical fix for a very bad bug");
    expect(result).not.toContain("absolutely");
    expect(result).not.toContain("very");
  });

  it("collapses multiple blank lines", () => {
    const result = cavemanCompress("Line 1\n\n\n\nLine 2");
    expect(result).toBe("Line 1\n\nLine 2");
  });

  it("preserves technical terms", () => {
    const result = cavemanCompress("Use GitNexus for impact analysis before editing any Python file");
    expect(result).toContain("GitNexus");
    expect(result).toContain("impact analysis");
    expect(result).toContain("Python");
  });

  it("handles empty input", () => {
    expect(cavemanCompress("")).toBe("");
  });

  it("leaves code-only content intact", () => {
    const input = "```typescript\nconst x = 1;\n```";
    expect(cavemanCompress(input)).toBe(input);
  });
});
