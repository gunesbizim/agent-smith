#!/usr/bin/env node
/**
 * PreCompact hook — deterministic best-effort handoff snapshot.
 *
 * Fires right before Claude Code compacts the conversation (manual or auto). Compaction is the
 * moment context is most at risk, so this writes a small, deterministic `HANDOFF-autosnapshot.md`
 * at the repo root capturing what an out-of-context recovery would most want: the branch, recent
 * commits, working-tree status, and any open PR. It does NOT reason about the task or delegate —
 * that is the `handoff` skill's job; this is the safety net for when nobody ran the skill in time.
 *
 * STRICTLY FAIL-OPEN: every operation is wrapped; the hook NEVER throws and ALWAYS exits 0 with an
 * empty `{}` so it cannot block or delay compaction. A snapshot is a bonus, never a requirement.
 *
 * Configure in .claude/settings.json (handled by src/scaffold/hooks.ts):
 *   "PreCompact": [{ "hooks": [
 *     { "type": "command", "command": "node hooks/pre-compact-handoff.js" } ]}]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const SNAPSHOT_FILENAME = "HANDOFF-autosnapshot.md";

// ---- pure, testable helper ----

/**
 * Render the snapshot markdown from already-gathered facts. Pure — no fs, no git, no clock input
 * beyond what is passed in, so it is deterministic and unit-testable.
 *  @param {object} facts
 *  @param {string} facts.branch       current branch name (or "")
 *  @param {string} facts.status       `git status --short` output (or "")
 *  @param {string} facts.recentCommits `git log --oneline -10` output (or "")
 *  @param {string} facts.openPr        open-PR summary line (or "")
 *  @param {string} facts.timestamp     ISO timestamp string
 *  @returns {string} markdown document
 */
export function renderSnapshot({ branch, status, recentCommits, openPr, timestamp } = {}) {
  const dirty = (status || "").trim();
  return [
    `# HANDOFF — auto-snapshot (pre-compaction)`,
    ``,
    `> Deterministic safety net written by the \`pre-compact-handoff\` hook before context`,
    `> compaction. It is NOT a substitute for running the \`handoff\` skill, which reasons about`,
    `> the work and delegates the remainder to fresh agents. Treat this as raw recovery state.`,
    ``,
    `- Generated: ${timestamp || "unknown"}`,
    `- Branch: ${branch || "(unknown)"}`,
    `- Working tree: ${dirty ? "DIRTY (uncommitted changes below)" : "clean"}`,
    ``,
    `## Open PR`,
    ``,
    (openPr || "").trim() || "_none detected_",
    ``,
    `## Recent commits`,
    ``,
    "```",
    (recentCommits || "").trim() || "(none)",
    "```",
    ``,
    `## Uncommitted changes (git status --short)`,
    ``,
    "```",
    dirty || "(working tree clean)",
    "```",
    ``,
    `## Next steps`,
    ``,
    `Run the \`handoff\` skill (\`.claude/skills/handoff/SKILL.md\`) or \`/as-handoff\` to turn this`,
    `raw state into a proper handoff with discrete, delegable subtasks.`,
    ``,
  ].join("\n");
}

// ---- fail-open helpers ----

function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim(); // NOSONAR — fixed binary, fixed args
  } catch {
    return "";
  }
}

function gh(args, cwd) {
  try {
    return execFileSync("gh", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim(); // NOSONAR
  } catch {
    return "";
  }
}

// ---- hook entry point ----

function main() {
  try {
    // Drain stdin so Claude Code never blocks writing to us; we don't need its contents.
    try {
      fs.readFileSync(0, "utf-8");
    } catch {
      /* no stdin */
    }

    const cwd = process.cwd();
    // Only act inside a git repo; otherwise there is no useful state to snapshot.
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    if (!branch) {
      console.log("{}");
      return;
    }

    const status = git(["status", "--short"], cwd);
    const recentCommits = git(["log", "--oneline", "-10"], cwd);
    const openPr = gh(["pr", "list", "--head", branch, "--state", "open"], cwd);

    const md = renderSnapshot({
      branch,
      status,
      recentCommits,
      openPr,
      timestamp: new Date().toISOString(),
    });

    try {
      fs.writeFileSync(path.join(cwd, SNAPSHOT_FILENAME), md, "utf-8");
    } catch {
      /* writing the snapshot is best-effort — never block compaction on it */
    }
  } catch {
    /* swallow everything — the hook must never throw */
  } finally {
    // Always emit an empty, valid hook result and exit 0.
    console.log("{}");
  }
}

function fileURLToPathSafe(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPathSafe(import.meta.url);
if (invokedDirectly) main();
