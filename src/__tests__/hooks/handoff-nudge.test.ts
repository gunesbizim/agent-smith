import { describe, it, expect } from "vitest";
import { decideNudge, estimateContextTokens, nudgeMessage } from "../../../hooks/user-prompt-handoff-nudge.js";

describe("estimateContextTokens", () => {
  it("uses the LAST assistant usage block (current occupancy, not cumulative)", () => {
    const lines = [
      JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 1000, output_tokens: 100 } } }),
      JSON.stringify({ type: "user", message: { content: "hi" } }),
      JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 50000, cache_read_input_tokens: 60000, cache_creation_input_tokens: 1000, output_tokens: 2000 } } }),
    ].join("\n");
    expect(estimateContextTokens(lines)).toBe(113000);
  });

  it("returns 0 with no usage / unparseable / empty input", () => {
    expect(estimateContextTokens("")).toBe(0);
    expect(estimateContextTokens("not json\n{}")).toBe(0);
  });

  it("also reads a top-level usage object", () => {
    expect(estimateContextTokens(JSON.stringify({ usage: { input_tokens: 10, output_tokens: 5 } }))).toBe(15);
  });
});

describe("decideNudge", () => {
  it("nudges at/above threshold when not already nudged", () => {
    expect(decideNudge({ tokens: 120000, windowSize: 200000, threshold: 0.6, alreadyNudged: false })).toEqual({ nudge: true, pct: 60 });
  });
  it("does not nudge below threshold", () => {
    expect(decideNudge({ tokens: 100000, windowSize: 200000, threshold: 0.6, alreadyNudged: false }).nudge).toBe(false);
  });
  it("never nudges twice in a session", () => {
    expect(decideNudge({ tokens: 200000, windowSize: 200000, threshold: 0.6, alreadyNudged: true }).nudge).toBe(false);
  });
});

describe("nudgeMessage", () => {
  it("mentions the percent and points at /as-handoff", () => {
    const m = nudgeMessage(72);
    expect(m).toContain("72%");
    expect(m).toContain("/as-handoff");
  });
});
