# Agent Smith — Autonomous Development Pipeline

Single npm package that auto-configures MCP servers, scaffolds project-aware Claude Code skills, and drives autonomous ticket-to-PR workflows.

One command to bootstrap any project:

```bash
npx agent-smith init
```

## What it does

1. **Analyzes** your codebase — detects frameworks (22 backends, 16 frontends), languages, ORMs, test runners, linters, CI/CD
2. **Installs** MCP servers — gitnexus, git-memory, serena, playwright, chrome-devtools, sonarqube, obsidian, mempalace, jira
3. **Scaffolds** skills — commands and worker skills customized to your tech stack via `{{PLACEHOLDER}}` templates
4. **Configures** everything — writes `.claude/settings.json`, `.mcp.json`, architecture docs

## CLI

```
npx agent-smith init              # Full project bootstrap
npx agent-smith analyze           # Detect tech stack and print report
npx agent-smith configure         # Re-run MCP configuration only
npx agent-smith doctor            # Health check: MCPs + skills + git
npx agent-smith ticket PROJ-123  # Jira ticket → autonomous pipeline
npx agent-smith pipeline          # Run pipeline on current branch
```

## Supported stacks

| Language | Backends | Frontends |
|----------|----------|-----------|
| Python | Django, FastAPI, Flask, Pyramid | — |
| TypeScript/JS | Express, NestJS, Fastify, Koa, Hono, AdonisJS, Next.js API, Nuxt API, Remix, SvelteKit API, FeathersJS | React, Next.js, Vue 3, Nuxt 3, Angular, Svelte, SvelteKit, SolidJS, Qwik, Astro |
| Ruby | Rails, Sinatra | — |
| PHP | Laravel, Symfony, Slim | — |
| Java | Spring Boot, Quarkus, Micronaut, Jakarta EE | — |
| Kotlin | Spring Boot Kotlin, Ktor | — |
| Go | Gin, Echo, Fiber, Chi | — |
| Rust | Actix-web, Axum, Rocket | — |
| C# | ASP.NET Core, Blazor API | Blazor WASM |
| Swift | Vapor | SwiftUI |
| Dart | — | Flutter |
| Scala | Play Framework | — |

All stacks that gitnexus can index. Detector recognizes 38 frameworks across 12 languages.

## Architecture

```
templates/           ← Skill stubs with {{PLACEHOLDER}} vars
├── commands/        ← 6 orchestrator commands
├── skills/          ← 6 worker skills (pr-review, test, docs × backend/frontend)
└── configs/         ← MCP config templates

src/
├── analyze/         ← Detects framework, conventions, patterns
├── adapt/           ← Template engine + skill customizer
├── install/         ← MCP registry + dependency checker + installer
├── scaffold/        ← Writes commands/skills/configs
├── jira/            ← Ticket parsing + epic decomposition
├── pipeline/        ← 6-phase autonomous orchestrator
├── docs/            ← API docs + Playwright screenshots + Obsidian notes
└── shared/          ← Types, templates, platform adapters
```

## Pipeline phases

```
ticket → PLAN → IMPLEMENT → TEST → REVIEW → DOCUMENT → PR
          ↑ gitnexus    ↑ serena   ↑ pytest/   ↑ self-    ↑ playwright ↑ gh pr
            impact       symbol     vitest/    review     obsidian    create
            analysis      nav       jest
```

## Package contents

```
agent-smith/
├── bin/agent-smith.js    CLI entry
├── src/                  TypeScript source (28 modules)
├── templates/            Skill stubs + architecture templates
├── smithery.yaml         Smithery one-click deployment
├── package.json
└── vitest.config.ts      212 tests, 14 test files
```

## Import / integrate

```typescript
import { detectProject, installMCPs, scaffoldSkills, customizeSkills } from "agent-smith";
```

Or via Smithery: `smithery install agent-smith`
