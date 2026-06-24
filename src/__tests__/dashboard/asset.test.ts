import { describe, expect, it } from "vitest";
import { dashboardHtmlPath, readDashboardHtml } from "../../dashboard/asset.js";

describe("dashboard asset", () => {
  it("resolves the shipped template path", () => {
    expect(dashboardHtmlPath().replace(/\\/g, "/")).toMatch(/templates\/dashboard\/index\.html$/);
  });

  it("reads a self-contained HTML page (no external scripts/styles/hosts)", () => {
    const html = readDashboardHtml();
    expect(html).toContain("Agent Call Dashboard");
    expect(html).not.toMatch(/<script\s+src=/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/https?:\/\//i); // no CDN / remote hosts
  });

  it("caches the read (returns identical content on repeat)", () => {
    expect(readDashboardHtml()).toBe(readDashboardHtml());
  });
});
