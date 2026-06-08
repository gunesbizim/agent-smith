// Scaffold commands from templates
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import { resolveTemplate } from "../shared/templates.js";
import type { TemplateVariables } from "../shared/types.js";

// Resolve the package root directory — works across Windows/macOS/Linux
function getPackageRoot(): string {
  // fileURLToPath handles Windows drive letters and UNC paths correctly
  const thisFile = fileURLToPath(import.meta.url);
  // thisFile = .../dist/scaffold/commands.js → go up 3 levels to package root
  return path.resolve(path.dirname(thisFile), "..", "..");
}

const COMMAND_TEMPLATES: Record<string, string> = {
  "backend.md": "templates/commands/backend.md",
  "frontend.md": "templates/commands/frontend.md",
  "test.md": "templates/commands/test.md",
  "pr-review.md": "templates/commands/pr-review.md",
  "documentation.md": "templates/commands/documentation.md",
  "git.md": "templates/commands/git.md",
  "caveman.md": "templates/commands/caveman.md",
  "insights.md": "templates/commands/insights.md",
};

export async function scaffoldCommands(
  targetDir: string,
  vars: TemplateVariables,
  dryRun: boolean = false,
): Promise<void> {
  const commandsDir = path.join(targetDir, ".claude", "commands");
  if (!dryRun) {
    fs.ensureDirSync(commandsDir);
  }

  for (const [filename, templatePath] of Object.entries(COMMAND_TEMPLATES)) {
    const destPath = path.join(commandsDir, filename);

    // Try the shipped template first, fall back to reading from repo
    let template: string;
    try {
      // In production, templates/ ships next to dist/ in the npm package
      const pkgTemplatePath = path.join(getPackageRoot(), templatePath);
      template = await fs.readFile(pkgTemplatePath, "utf-8");
    } catch {
      // Fallback: read from project's own templates/
      const fallbackPath = path.join(targetDir, templatePath);
      template = await fs.readFile(fallbackPath, "utf-8");
    }

    const resolved = resolveTemplate(template, vars);

    if (dryRun) {
      console.log(`  Would write: ${destPath}`);
    } else {
      await fs.writeFile(destPath, resolved, "utf-8");
    }
  }
}
