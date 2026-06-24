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
  "as-backend.md": "templates/commands/as-backend.md",
  "as-frontend.md": "templates/commands/as-frontend.md",
  "as-test.md": "templates/commands/as-test.md",
  "as-pr-review.md": "templates/commands/as-pr-review.md",
  "as-documentation.md": "templates/commands/as-documentation.md",
  "as-git.md": "templates/commands/as-git.md",
  "as-ship.md": "templates/commands/as-ship.md",
  "as-caveman.md": "templates/commands/as-caveman.md",
  "as-insights.md": "templates/commands/as-insights.md",
  "as-handoff.md": "templates/commands/as-handoff.md",
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
