import { describe, it, expect } from "vitest";
import {
  detectPackageManagers,
  requiredManagersFor,
  pmRemediation,
  allRequiredManagers,
} from "../../install/package-managers.js";
import { MCP_REGISTRY } from "../../install/registry.js";

describe("detectPackageManagers", () => {
  const has = (...present: string[]) => (cmd: string) => present.includes(cmd);

  it("reports presence per manager", () => {
    const out = detectPackageManagers(["npm", "brew", "pipx"], has("npm", "pipx"));
    expect(out).toEqual([
      { name: "npm", present: true },
      { name: "brew", present: false },
      { name: "pipx", present: true },
    ]);
  });

  it("treats python3 as satisfying python", () => {
    const out = detectPackageManagers(["python"], has("python3"));
    expect(out[0].present).toBe(true);
  });

  it("dedupes the needed list", () => {
    const out = detectPackageManagers(["npm", "npm"], has());
    expect(out).toHaveLength(1);
  });
});

describe("requiredManagersFor / allRequiredManagers", () => {
  it("unions requiresPackageManager across servers", () => {
    const mgrs = requiredManagersFor(MCP_REGISTRY);
    expect(mgrs).toContain("npm");
    expect(mgrs).toContain("npx");
    expect(mgrs).toContain("pipx");
    expect(mgrs).toContain("brew");
    expect(mgrs).toContain("composer");
  });

  it("allRequiredManagers matches the registry union", () => {
    expect(allRequiredManagers().sort()).toEqual(requiredManagersFor(MCP_REGISTRY).sort());
  });
});

describe("pmRemediation", () => {
  it("only pipx is auto-installable (no sudo policy)", () => {
    expect(pmRemediation("pipx", "linux").autoInstallable).toBe(true);
    for (const pm of ["brew", "composer", "php", "npm", "npx", "python"] as const) {
      expect(pmRemediation(pm, "linux").autoInstallable).toBe(false);
    }
  });

  it("gives a non-empty hint for every manager", () => {
    for (const pm of ["npm", "npx", "pipx", "python", "brew", "composer", "php", "winget", "choco"] as const) {
      expect(pmRemediation(pm, "darwin").hint.length).toBeGreaterThan(0);
    }
  });
});
