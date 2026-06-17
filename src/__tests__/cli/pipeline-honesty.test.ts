// B9 — the not-yet-wired orchestration commands must tell the truth. They print a
// planned phase sequence but do not execute it; an explicit experimental banner must
// appear so `ticket --auto` never implies a PR was created when none was.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pipelineCommand } from "../../cli/pipeline.js";
import { ticketCommand } from "../../cli/ticket.js";
import { EXPERIMENTAL_BANNER_TEXT } from "../../cli/experimental-banner.js";

describe("pipeline/ticket honesty banner (B9)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let out: string;

  beforeEach(() => {
    out = "";
    logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      out += args.join(" ") + "\n";
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("pipeline prints the experimental banner", async () => {
    await pipelineCommand({});
    expect(out).toContain(EXPERIMENTAL_BANNER_TEXT);
  });

  it("ticket prints the experimental banner", async () => {
    await ticketCommand("PROJ-123", { auto: true });
    expect(out).toContain(EXPERIMENTAL_BANNER_TEXT);
  });

  it("ticket no longer claims the pipeline 'will execute'", async () => {
    await ticketCommand("PROJ-123", {});
    expect(out).not.toContain("Pipeline will execute");
  });
});
