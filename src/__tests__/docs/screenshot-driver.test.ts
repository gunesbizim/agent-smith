import { describe, it, expect } from "vitest";
import { planScreenshots, executeScreenshots } from "../../docs/screenshot-driver.js";
import type { ScreenshotJob } from "../../docs/screenshot-driver.js";

describe("Screenshot Driver", () => {
  describe("planScreenshots", () => {
    it("generates jobs for each flow × role combination", () => {
      const flows = ["dashboard", "settings"];
      const roles = ["admin", "lawyer"];
      const jobs = planScreenshots(flows, roles, "http://localhost:3000");

      expect(jobs).toHaveLength(4); // 2 flows × 2 roles
    });

    it("each job has the correct structure", () => {
      const jobs = planScreenshots(["login"], ["admin"], "http://localhost:3000");
      const job = jobs[0];

      expect(job.flow).toBe("login");
      expect(job.role).toBe("admin");
      expect(job.step).toBe(1);
      expect(job.route).toBe("http://localhost:3000/login");
      expect(Array.isArray(job.actions)).toBe(true);
      expect(job.filename).toContain("login-admin-");
      expect(job.filename).toContain(".png");
    });

    it("includes navigate + snapshot + screenshot actions per job", () => {
      const jobs = planScreenshots(["home"], ["supervisor"], "http://localhost:3000");
      const job = jobs[0];

      const actionTypes = job.actions.map((a) => a.type);
      expect(actionTypes).toContain("navigate");
      expect(actionTypes).toContain("snapshot");
      expect(actionTypes).toContain("screenshot");
      expect(actionTypes).toContain("wait");
    });

    it("handles empty flows", () => {
      const jobs = planScreenshots([], ["admin"], "http://localhost:3000");
      expect(jobs).toEqual([]);
    });

    it("handles empty roles", () => {
      const jobs = planScreenshots(["dashboard"], [], "http://localhost:3000");
      expect(jobs).toEqual([]);
    });

    it("filenames are unique per flow+role combination", () => {
      const jobs = planScreenshots(["a", "b"], ["admin", "lawyer"], "http://localhost:3000");
      const filenames = jobs.map((j) => j.filename);
      expect(new Set(filenames).size).toBe(filenames.length);
    });
  });

  describe("executeScreenshots", () => {
    it("returns filenames (stub)", async () => {
      const jobs: ScreenshotJob[] = [
        {
          flow: "test",
          role: "admin",
          step: 1,
          route: "http://localhost/test",
          actions: [{ type: "navigate", url: "http://localhost/test" }],
          filename: "test.png",
        },
      ];
      const result = await executeScreenshots(jobs);
      expect(result).toEqual(["test.png"]);
    });

    it("handles empty jobs", async () => {
      const result = await executeScreenshots([]);
      expect(result).toEqual([]);
    });
  });
});
