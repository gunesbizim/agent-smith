#!/usr/bin/env node
// agent-smith CLI — thin shim that loads the compiled JS entry point
// Falls back to tsx for development

async function main() {
  try {
    // Try the compiled dist first
    const { run } = await import("../dist/cli/index.js");
    await run(process.argv);
  } catch (e) {
    // Development fallback — use tsx
    const { spawn } = await import("node:child_process");
    const child = spawn(
      "npx",
      ["tsx", new URL("../src/cli/index.ts", import.meta.url).pathname, ...process.argv.slice(2)],
      { stdio: "inherit" },
    );
    child.on("exit", (code) => process.exit(code ?? 1));
  }
}

main();
