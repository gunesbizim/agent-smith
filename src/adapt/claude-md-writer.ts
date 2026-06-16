// CLAUDE.md writer — maintains an agent-smith-managed section inside the target project's
// CLAUDE.md WITHOUT clobbering anything the user wrote.
//
// agent-smith owns only the content between the markers:
//   <!-- agent-smith:start -->  ...  <!-- agent-smith:end -->
// Everything outside the markers is the user's and is preserved verbatim. On re-init the
// managed block is regenerated in place; if no CLAUDE.md exists one is created with just the
// block. The block enumerates every scaffolded /as-* command and every skill so an agent
// reading CLAUDE.md always sees the full, current capability surface.
import path from "node:path";
import fs from "fs-extra";

export const START_MARKER = "<!-- agent-smith:start -->";
export const END_MARKER = "<!-- agent-smith:end -->";

interface Entry {
  name: string;
  description: string;
}

// Collapse whitespace, unwrap quotes, and trim a description to a single readable line.
function oneLine(text: string, max = 140): string {
  const flat = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\\"/g, '"')        // unescape YAML-escaped quotes
    .replace(/^["']|["']$/g, "") // strip a single surrounding quote pair
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

// Commands have no frontmatter — the name is the filename and the description is the first
// non-empty prose line.
function scanCommands(commandsDir: string): Entry[] {
  if (!fs.existsSync(commandsDir)) return [];
  const entries: Entry[] = [];
  for (const file of fs.readdirSync(commandsDir).sort()) {
    if (!file.endsWith(".md")) continue;
    const name = `/${file.replace(/\.md$/, "")}`;
    const raw = safeRead(path.join(commandsDir, file));
    const firstLine = raw.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
    entries.push({ name, description: oneLine(firstLine) });
  }
  return entries;
}

// Skills live at <skillsDir>/<name>/SKILL.md (possibly nested one more level for MCP helper
// skill groups). Each SKILL.md has YAML frontmatter with name + description.
function scanSkills(skillsDir: string): Entry[] {
  if (!fs.existsSync(skillsDir)) return [];
  const found: Entry[] = [];
  for (const skillFile of findSkillFiles(skillsDir)) {
    const { name, description } = parseFrontmatter(safeRead(skillFile));
    const fallbackName = path.basename(path.dirname(skillFile));
    found.push({ name: name || fallbackName, description: oneLine(description) });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

// Recursively collect SKILL.md paths (bounded depth — skill dirs are shallow).
function findSkillFiles(dir: string, depth = 0): string[] {
  if (depth > 3 || !fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findSkillFiles(full, depth + 1));
    } else if (entry.name === "SKILL.md") {
      out.push(full);
    }
  }
  return out;
}

// Minimal YAML frontmatter parse — just name + description (description may be a folded `>` block).
function parseFrontmatter(content: string): { name: string; description: string } {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return { name: "", description: "" };
  let name = "";
  const descParts: string[] = [];
  let inDesc = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") break;
    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) { name = nameMatch[1].trim(); inDesc = false; continue; }
    const descMatch = line.match(/^description:\s*(.*)$/);
    if (descMatch) {
      inDesc = true;
      const rest = descMatch[1].replace(/^[>|]\s*$/, "").trim();
      if (rest && rest !== ">" && rest !== "|") descParts.push(rest);
      continue;
    }
    if (inDesc && /^\s+\S/.test(line)) { descParts.push(line.trim()); continue; }
    if (inDesc) inDesc = false;
  }
  return { name, description: descParts.join(" ") };
}

function safeRead(p: string): string {
  // Normalize CRLF → LF so per-line regex anchors behave (some scaffolded stubs ship CRLF).
  try { return fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n"); } catch { return ""; }
}

function table(rows: Entry[]): string {
  if (rows.length === 0) return "_none_\n";
  const head = "| Name | Purpose |\n|------|---------|\n";
  return head + rows.map((r) => `| \`${r.name}\` | ${r.description.replace(/\|/g, "\\|")} |`).join("\n") + "\n";
}

// Build the managed block (markers included).
export function buildManagedBlock(commands: Entry[], skills: Entry[]): string {
  return [
    START_MARKER,
    "<!-- Managed by agent-smith. Do not edit by hand — re-run `agent-smith init` to refresh. -->",
    "",
    "# Agent Smith — Commands & Skills",
    "",
    "This project is set up with agent-smith. The commands and skills below are available to",
    "every session. For any task spanning multiple files, sources, or sessions, follow the",
    "**fable-mode** execution discipline (`.claude/skills/fable-mode/SKILL.md`): stage map →",
    "delegate → failable verification → self-critique.",
    "",
    "## Slash commands",
    "",
    table(commands),
    "## Skills",
    "",
    table(skills),
    END_MARKER,
  ].join("\n");
}

// Splice the managed block into existing content, preserving everything outside the markers.
function splice(existing: string, block: string): string {
  const start = existing.indexOf(START_MARKER);
  const end = existing.indexOf(END_MARKER);
  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start);
    const after = existing.slice(end + END_MARKER.length);
    return `${before}${block}${after}`;
  }
  // No markers yet — append the block, keeping the user's content above it.
  const sep = existing.trim().length > 0 ? `${existing.replace(/\s*$/, "")}\n\n` : "";
  return `${sep}${block}\n`;
}

export interface ClaudeMdResult {
  written: boolean;
  created: boolean;
  path: string;
}

/**
 * Write/refresh the agent-smith managed block in <targetDir>/CLAUDE.md. Non-destructive:
 * user content outside the markers is always preserved.
 */
export function writeClaudeMd(targetDir: string, dryRun = false): ClaudeMdResult {
  const claudePath = path.join(targetDir, "CLAUDE.md");
  const commands = scanCommands(path.join(targetDir, ".claude", "commands"));
  const skills = scanSkills(path.join(targetDir, ".claude", "skills"));
  const block = buildManagedBlock(commands, skills);

  const existed = fs.existsSync(claudePath);
  const existing = existed ? safeRead(claudePath) : "";
  const next = splice(existing, block);

  if (!dryRun) {
    fs.writeFileSync(claudePath, next, "utf-8");
  }
  return { written: !dryRun, created: !existed, path: claudePath };
}
