---
title: CI, Release & Deploy
type: doc
tags: [agent-smith, ci, release, sonarcloud, plugin]
updated: 2026-06-28
---

# CI, Release & Deploy

Back to [[index]]. GitHub Actions in `.github/workflows/`, plus SonarCloud and the Claude plugin
manifest.

## CI — `ci.yml`

Triggers: push to `main`, PR to `main`, `workflow_dispatch`. Concurrency-grouped (cancels
in-progress runs for the same ref). Jobs:

| Job | Runs | Steps |
|---|---|---|
| **typecheck** | ubuntu-24.04, Node 22 | `npm ci` → `npx tsc --noEmit` |
| **test** | matrix Node 20 & 22 (no fail-fast) | `npm ci` → `npm audit --audit-level=high` → `npm test` → upload results (Node 22) |
| **test-windows** | windows-latest, Node 22 | `npm ci` → `npx tsc --noEmit` → `npm test` — runs the full suite on Windows so platform-specific install logic (`presenceProbe` → `where`, `needsShellForCli`, path/line-ending handling) is actually exercised; the rest of CI is Linux-only, so Windows regressions were previously invisible |
| **sonarcloud** | needs `test` | full-history checkout → coverage (`vitest run --coverage --coverage.reporter=lcov`) → **SonarCloud Scan** (org `gunesbizim`, key `gunesbizim_agent-smith`) → **Quality Gate** (wait ≤5 min) |
| **build** | needs `typecheck`+`test` | `npm run build` → verify `dist/index.js` exists → upload `dist/` (7-day retention) |

## Release — `release.yml`

Trigger: push tag `v*`. Permissions: `contents: write`, `packages: write`.

| Job | Steps |
|---|---|
| **verify** | `npm ci` → `tsc --noEmit` → `npm test` |
| **publish-npm** | needs verify → `npm run build` → `npm publish --access public` (`NODE_AUTH_TOKEN` = `secrets.NPM_TOKEN`) |
| **github-release** | needs publish-npm → build → generate `CHANGELOG.md` from git log since last tag → `softprops/action-gh-release` with `dist/` |

> Per the user's deployment policy: publish goes through GitHub/CI (tag → release), never direct
> file copy; npm publish requires the OTP/2FA token in CI secrets.

**Cutting a release.** Bump `package.json`, `.claude-plugin/plugin.json`, and
`sonar-project.properties` to the new version (keep all three in sync — see
[[00-overview#Version map]]), merge to `main`, then push an annotated `vX.Y.Z` tag. The tag fires
`release.yml`, which re-verifies, publishes to npm, and opens the GitHub release with notes
auto-generated from the git log since the previous tag.

**Latest release: `v1.1.0`** (2026-06-28) — dashboard now tracks every tool + MCP call in
interactive sessions (`#72`), all MCP scopes consolidated into `.mcp.json` (`#73`), god-file
decomposition + ~190 SonarCloud issues resolved (`#69`, `#70`, `#74`), and the manually-expanded
dashboard rows persist across re-renders (`#74`).

## Security workflows

- **`codeql.yml`** — CodeQL for `javascript-typescript`, queries `security-extended` +
  `security-and-quality`, paths `src`. On push/PR to main, weekly schedule (Wed 03:17 UTC),
  and on demand.
- **`dependency-review.yml`** — on PR; fails on **high** severity; denies `GPL-2.0-only` /
  `GPL-3.0-only` licenses.
- **`dependabot.yml`** — dependency update automation.

## SonarCloud — `sonar-project.properties`

Sources `src/`, tests `src/__tests__/`, coverage `coverage/lcov.info`, excludes `dist/**` &
`node_modules/**`, waits for the gate. Three documented issue suppressions:

| Resource | Rule | Why |
|---|---|---|
| `**/templates/**` | `typescript:S1134` | FIXME/TODO inside templates are intentional |
| `src/__tests__/**` | `typescript:S5443` | file paths in tests are mock args |
| `src/install/mcp-installer.ts` | `typescript:S4036` | resolves `claude` via PATH on purpose; args passed as array (no shell injection) |

A local SonarQube can be run via `sonarqube/docker-compose.yml` + `sonarqube/setup.sh`
(npm scripts `sonarqube:start` / `:stop` / `:setup`, and `sonarqube` to scan).

## Claude plugin — `.claude-plugin/plugin.json`

Plugin id `agent-smith`. Capabilities: Read, Write, Interactive, Agent. Registers a
self-bootstrapping MCP server whose command is
`npx @gunesbizim/agent-smith init --auto --no-interview`, so activating the plugin runs a
one-click init. Ships four default prompts (initialize / analyze / health check / insights).

## npm package

`package.json` ships `dist/`, `templates/`, `hooks/`, `bin/`, `README`, `LICENSE`.
Scripts: `build` (tsc), `dev` (tsc --watch), `test`/`test:watch`/`test:coverage` (vitest),
`lint` (eslint), `typecheck`, and the sonarqube helpers. `prepublishOnly` runs the build.
