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
    .replaceAll(/\s+/g, " ")
    .trim()
    .replaceAll('\\"', '"')         // unescape YAML-escaped quotes
    .replaceAll(/^["']|["']$/g, "") // strip a single surrounding quote pair
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

// Commands have no frontmatter — the name is the filename and the description is the first
// non-empty prose line.
function scanCommands(commandsDir: string): Entry[] {
  if (!fs.existsSync(commandsDir)) return [];
  const entries: Entry[] = [];
  for (const file of fs.readdirSync(commandsDir).sort((a, b) => a.localeCompare(b))) {
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

type FmState = { name: string; descParts: string[]; inDesc: boolean };

// Handle the `description:` key line; mutates state.
function handleDescriptionLine(line: string, state: FmState): void {
  state.inDesc = true;
  const rest = line.slice("description:".length).trim();
  if (rest && rest !== ">" && rest !== "|") state.descParts.push(rest);
}

// Handle a folded-continuation or non-key line; mutates state.
function handleContinuationLine(line: string, trimmed: string, state: FmState): void {
  const indented = (line.startsWith(" ") || line.startsWith("\t")) && trimmed.length > 0;
  if (state.inDesc && indented) {
    state.descParts.push(trimmed);
  } else if (state.inDesc) {
    state.inDesc = false;
  }
}

// Process one frontmatter line; mutates `state`. Returns true to continue, false to break.
function processFrontmatterLine(line: string, state: FmState): boolean {
  const trimmed = line.trim();
  if (trimmed === "---") return false; // closing fence
  if (line.startsWith("name:")) {
    state.name = line.slice("name:".length).trim();
    state.inDesc = false;
    return true;
  }
  if (line.startsWith("description:")) {
    handleDescriptionLine(line, state);
    return true;
  }
  // Folded continuation: an indented, non-empty line beneath `description:`.
  handleContinuationLine(line, trimmed, state);
  return true;
}

// Minimal YAML frontmatter parse — just name + description (description may be a folded `>`
// block). Uses plain string operations (no regex) to avoid backtracking/ReDoS concerns.
function parseFrontmatter(content: string): { name: string; description: string } {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return { name: "", description: "" };
  const state = { name: "", descParts: [] as string[], inDesc: false };
  for (let i = 1; i < lines.length; i++) {
    if (!processFrontmatterLine(lines[i], state)) break;
  }
  return { name: state.name, description: state.descParts.join(" ") };
}

function safeRead(p: string): string {
  // Normalize CRLF → LF so per-line regex anchors behave (some scaffolded stubs ship CRLF).
  try { return fs.readFileSync(p, "utf-8").replaceAll("\r\n", "\n"); } catch { return ""; }
}

// Escape a value for a markdown table cell — backslashes FIRST, then pipes, so an input
// backslash can't defeat the pipe escaping.
function cell(text: string): string {
  return text.replaceAll("\\", String.raw`\\`).replaceAll("|", String.raw`\|`);
}

function table(rows: Entry[]): string {
  if (rows.length === 0) return "_none_\n";
  const head = "| Name | Purpose |\n|------|---------|\n";
  return head + rows.map((r) => `| \`${cell(r.name)}\` | ${cell(r.description)} |`).join("\n") + "\n";
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
    "**smith-mode** execution discipline (`.claude/skills/smith-mode/SKILL.md`): stage map →",
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
  const sep = existing.trim().length > 0 ? `${existing.trimEnd()}\n\n` : "";
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

  // Read once (no existsSync-then-read) to avoid a time-of-check/time-of-use race.
  let existing = "";
  let existed = false;
  try {
    existing = fs.readFileSync(claudePath, "utf-8").replaceAll("\r\n", "\n");
    existed = true;
  } catch {
    // No CLAUDE.md yet — we'll create one.
  }
  const next = splice(existing, block);

  if (!dryRun) {
    fs.writeFileSync(claudePath, next, "utf-8");
  }
  return { written: !dryRun, created: !existed, path: claudePath };
}
