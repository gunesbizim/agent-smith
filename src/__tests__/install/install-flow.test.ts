import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../install/mcp-installer.js", () => ({
  selectServersToInstall: vi.fn(() => [{ name: "gitnexus" }]),
  installMCPs: vi.fn(async () => ({ installed: ["gitnexus"], prewarmed: [], alreadyPresent: [], onDemand: [], manual: [], failed: [] })),
}));
vi.mock("../../install/install-consent.js", () => ({
  resolveConsent: vi.fn(async () => ({ approved: true })),
}));

import { installWithConsent } from "../../install/install-flow.js";
import { installMCPs, selectServersToInstall } from "../../install/mcp-installer.js";
import { resolveConsent } from "../../install/install-consent.js";

const mockedInstall = vi.mocked(installMCPs);
const mockedConsent = vi.mocked(resolveConsent);

describe("installWithConsent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("installs when consent is approved", async () => {
    mockedConsent.mockResolvedValue({ approved: true });
    const res = await installWithConsent({ project: null }, { yes: true });
    expect(selectServersToInstall).toHaveBeenCalledWith({ project: null });
    expect(mockedInstall).toHaveBeenCalledWith({ project: null });
    expect(res.consent.approved).toBe(true);
    expect(res.summary).not.toBeNull();
  });

  it("skips install when consent is declined", async () => {
    mockedConsent.mockResolvedValue({ approved: false, reason: "declined" });
    const res = await installWithConsent({ project: null }, { noInstall: true });
    expect(mockedInstall).not.toHaveBeenCalled();
    expect(res.summary).toBeNull();
    expect(res.consent.reason).toBe("declined");
  });
});
