import { describe, it, expect, vi } from "vitest";
import { resolveConsent, describeInstallPlan } from "../../install/install-consent.js";
import { MCP_REGISTRY } from "../../install/registry.js";

const servers = MCP_REGISTRY.slice(0, 3);

describe("resolveConsent", () => {
  it("declines via --no-install without prompting", async () => {
    const prompt = vi.fn();
    const res = await resolveConsent(servers, { noInstall: true }, { isTTY: true, prompt });
    expect(res.approved).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
  });

  it("approves via --yes without prompting", async () => {
    const prompt = vi.fn();
    const res = await resolveConsent(servers, { yes: true }, { isTTY: true, prompt });
    expect(res.approved).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });

  it("approves via --auto without prompting", async () => {
    const prompt = vi.fn();
    const res = await resolveConsent(servers, { auto: true }, { isTTY: true, prompt });
    expect(res.approved).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });

  it("declines non-interactively (no flag, no TTY) and never prompts — anti-hang", async () => {
    const prompt = vi.fn();
    const res = await resolveConsent(servers, {}, { isTTY: false, prompt });
    expect(res.approved).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
  });

  it("approves on a TTY when the user answers y (and on bare Enter)", async () => {
    expect((await resolveConsent(servers, {}, { isTTY: true, prompt: async () => "y" })).approved).toBe(true);
    expect((await resolveConsent(servers, {}, { isTTY: true, prompt: async () => "" })).approved).toBe(true);
  });

  it("declines on a TTY when the user answers n", async () => {
    const res = await resolveConsent(servers, {}, { isTTY: true, prompt: async () => "n" });
    expect(res.approved).toBe(false);
  });

  it("declines an empty server set", async () => {
    expect((await resolveConsent([], { yes: true })).approved).toBe(false);
  });
});

describe("describeInstallPlan", () => {
  it("lists each server name", () => {
    const text = describeInstallPlan(servers);
    for (const s of servers) expect(text).toContain(s.name);
  });
});
