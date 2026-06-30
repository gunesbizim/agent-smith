---
title: MCP Servers
type: doc
tags: [agent-smith, mcp]
updated: 2026-06-29
---

# MCP Servers

> **Maintenance note (2026-06-28):** `registerLocalMCPs` removed; `ClaudeCodeAdapter` now writes
> only `.mcp.json`; nothing writes the legacy `~/.claude.json` blob. See the scope section below.
>
> **Maintenance note (2026-06-29):** Serena has been retired and removed from the registry,
> MCP config templates, doctor/health probes, hooks, and all skill/command/prompt templates.
> See [[#Retired servers]] below for migration guidance.

Back to [[index]]. Catalog: `src/install/registry.ts` (`MCP_REGISTRY`). Configured by
`src/install/mcp-installer.ts`. Reference bundles in `mcp/*.json`.

## Scope semantics — all scopes consolidated into `.mcp.json`

All applicable MCP servers — regardless of their registry `scope` (`project`, `both`, `user`,
or `local`) — are written into **`<projectRoot>/.mcp.json`** by `configureMCPs`. The registry
`scope` field remains informational (it describes intent) but no longer controls the output file.

| Registry scope | Meaning (intent) | Written to (actual) |
|---|---|---|
| `project` | repo-specific | `<repo>/.mcp.json` |
| `user` | available only in repos where agent-smith was set up | `<repo>/.mcp.json` |
| `both` | repo + user | `<repo>/.mcp.json` |
| `local` | per-repo, private (e.g. obsidian vault path) | `<repo>/.mcp.json` |

**`user` scope is intentionally per-project, not global.** A user-scoped server (mempalace,
vuetify, sonarqube, jira) is registered only in the projects where agent-smith was run — not in
the global `~/.claude/.mcp.json`. This is by design: cross-session tooling is available exactly
where the project opted into agent-smith, and nowhere else.

**Why all in `.mcp.json`?** It keeps every server entry in one inspectable file per repo,
eliminates the project/user/local config split, and avoids `claude mcp add --scope local`
subprocess calls. Because `.mcp.json` can hold resolved credentials (`SONARQUBE_TOKEN`,
`JIRA_API_TOKEN`) and private paths (the Obsidian vault), `configureMCPs` adds `.mcp.json` to the
target repo's `.gitignore` **immediately after writing the file** (via `ensureGitignore`), so those
values stay local and are never committed. agent-smith does not rely on the file being
pre-ignored — it makes it ignored.

**Duplicate-launch guard.** When a server written to the repo `.mcp.json` is *also* registered in
a global Claude config (`~/.claude/.mcp.json` or the legacy `~/.claude.json`), `configureMCPs`
warns (it does not auto-edit home-dir configs, which may hold those servers on purpose) and points
to the manual removal so the server does not launch twice.

**Config bundle.** `MCPConfigBundle` carries a single `projectMcp` map (the former
`projectSettings`/`userMcp` fields were vestigial after consolidation and were removed). All three
platform adapters (Claude Code, Cursor, Continue) read `projectMcp`.

**`mcpServers` is never written to `.claude/settings.json`.** On first run after upgrading,
`stripSettingsMcpServers(projectRoot)` removes the `mcpServers` key from an existing
`.claude/settings.json` (leaving `permissions`, `hooks`, and all other keys intact) so existing
installs are automatically de-duplicated.

**`~/.claude/.mcp.json` is never written** by agent-smith. User-scoped servers (mempalace,
vuetify, sonarqube, jira) are now in the repo `.mcp.json` instead.

The exported `ClaudeCodeAdapter` (`src/shared/platform-adapter.ts`, public-API alternate write
path, not used by the CLI flow) was also aligned: it now writes **only** `.mcp.json`
(`mcpConfigPath = ".mcp.json"`, `mcpConfigFormat = "claude-mcp"`) and no longer writes a
`mcpServers` block into `.claude/settings.json`.

Stack-specific servers are gated by `isServerApplicable()` so a project never gets a server it
has no use for. Gating applies to both **install** (`installMCPs({ project })`) and **config**
(`configureMCPs(..., project)`); when `project` is null (detection skipped) everything is included
for backward compatibility:

- **browser** (playwright, chrome-devtools) — only when a frontend is detected.
- **vuetify** — only when `project.frontend.uiLibrary` contains "Vuetify".
- **laravel-boost** — only when `project.backend.framework === "laravel"`.

Servers with `requiredEnvVars` are additionally skipped when those vars are unset (e.g. obsidian
requires `OBSIDIAN_VAULT_PATH`, sonarqube requires `SONARQUBE_TOKEN`, jira requires
`JIRA_API_TOKEN`). Set the env var then re-run `agent-smith configure` to add them.

## The catalog

| Server | Scope | Install | Check / Config | Role in the pipeline |
|---|---|---|---|---|
| **gitnexus** | project → `.mcp.json` | npm -g | `gitnexus mcp` | Code-intelligence graph: impact/blast-radius, execution flows, route maps. Used **every phase**, before reading/writing code. **`indexCommand`: `gitnexus analyze`** — run automatically at init (Step 11b) so the graph is ready in the first session. |
| **git-memory** | project → `.mcp.json` | npm -g | `git-memory serve` | Semantic search over git history — "why was this built this way?" Planning & review. **`indexCommand`: `git-memory index --repo-path .`** — run automatically at init (Step 11b). |
| **sentrux** | project → `.mcp.json` | shell (brew/curl/PS) | `sentrux mcp` / `--mcp` | Architectural sensor: quality signal (0–10000), cycles, coupling, DSM, test gaps. Review gate. [[08-sentrux-quality-gate]] |
| **playwright** | project → `.mcp.json` (frontend only) | npx | `@playwright/mcp@latest --viewport-size=1440,900 --output-dir .playwright-mcp` | Headless browser automation — drive app, screenshot per role. Frontend verify & docs. |
| **chrome-devtools** | project → `.mcp.json` (frontend only) | npx | `chrome-devtools-mcp@latest --browserUrl=…:9222` | Deep debugging — console, network, perf, lighthouse. Used by `docs-frontend` and `smoke-test` for real console/network/perf observation. |
| **sonarqube** | user → `.mcp.json` | npm -g | `sonarqube-mcp-server@latest` (env `SONARQUBE_TOKEN`, `SONARQUBE_URL`) | Static analysis — issues, quality gate, hotspots, coverage. |
| **vuetify** | user → `.mcp.json` (Vuetify only) | npx | `@vuetify/mcp` | Vuetify 3 component API lookup. Gated to Vuetify frontends. Referenced as `{{FRONTEND_UI_LIBRARY}}` MCP in frontend skills. |
| **laravel-boost** | project → `.mcp.json` (Laravel only) | manual | `php artisan boost:mcp` (check: `composer show laravel/boost`) | Framework-aware app intelligence — routes, models, DB schema, config, artisan, version-correct docs. Gated to Laravel backends; install is manual (`composer require laravel/boost --dev && php artisan boost:install`). |
| **obsidian** | local → `.mcp.json` (requires `OBSIDIAN_VAULT_PATH`) | npx | `mcp-obsidian ${OBSIDIAN_VAULT_PATH}` | Read/write the knowledge vault. Documentation. |
| **mempalace** | user → `.mcp.json` | pipx | `python -m mempalace.mcp_server` | Persistent knowledge-graph memory — drawers, tunnels, kg. |
| **jira** | user → `.mcp.json` (requires `JIRA_API_TOKEN`) | npx | `@anthropic/jira-mcp` (env `JIRA_API_TOKEN`, `JIRA_BASE_URL`) | Issue tracking — entry point for the ticket pipeline. |

> `registry.ts` is authoritative: **11 servers** (the list above; serena has been retired — see [[#Retired servers]]). `plugin.json`'s advertised count may drift.

## Programmatic install (init Step 9)

`init` installs MCP server binaries itself — it does NOT defer to the `configure` command, generated
skills, or Claude Code. Flow (`src/cli/init.ts` Step 9, after the interview):
`selectServersToInstall({project})` → `resolveConsent(...)` (batch approve; `--yes`/`--auto` skip the
prompt, `--no-install` declines, non-TTY declines to avoid hangs) → `installMCPs({project})`.

`installMCPs` (`src/install/mcp-installer.ts`) renders a **`cli-progress` bar** that names the server +
the exact command running, and dispatches per `installType`:
- `npm`/`pipx`/`python`/`shell` → run the install command.
- `prewarm` (playwright, chrome-devtools) → run `npx -y pkg --version` to warm the npx cache; **never** a
  bare `npx pkg` (that would launch the stdio server and hang — the original bug).
- `npx` with empty `installCommand` (vuetify, jira, obsidian) → no-op, fetched on first use.
- `manual` (laravel-boost) → skipped with a hint.

Each server declares `requiresPackageManager` (`src/install/package-managers.ts` detects them; missing
ones are reported with a no-sudo remediation hint and that server is skipped, never blocking init).

## Reference bundles (`mcp/`)

- **`mcp/project-mcp.json`** — project `.mcp.json` shape: sentrux (`--mcp`), chrome-devtools,
  playwright. (Note: all server scopes now go here; the bundle file may not reflect the full set.)
- **`mcp/project-settings.json`** — permissions and hooks only; `mcpServers` key must not appear
  here. Any existing `mcpServers` key is removed by `stripSettingsMcpServers` on next configure.
- **`mcp/user-mcp.json`** — legacy reference; user-scope servers are now in `.mcp.json`. This
  file is no longer written by agent-smith.

## Obsidian — special handling

Obsidian has `scope: "local"` in the registry (per-repo, private value). It is written into
`.mcp.json` like all other servers — no separate `claude mcp add` step — and `configureMCPs`
gitignores `.mcp.json` so the vault path stays private.

The vault lives at `./vault/` (this directory). On a fresh clone, set `OBSIDIAN_VAULT_PATH` before
running `agent-smith init` or `configure`:

```bash
export OBSIDIAN_VAULT_PATH="$(pwd)/vault"
agent-smith configure
```

`setupObsidianVault()` (`src/install/obsidian-vault.ts`) still runs during `init`/`configure` to
resolve the vault path (`OBSIDIAN_VAULT_PATH` env, or interactive prompt defaulting to
`<root>/vault`) and **create the directory** (`mcp-obsidian` requires an existing dir). The old
`claude mcp add --scope local` registration step (`registerLocalMCPs`) has been **removed
entirely** — the obsidian entry is in `.mcp.json` instead, written by `configureMCPs` when
`OBSIDIAN_VAULT_PATH` is set. Nothing in agent-smith writes to the legacy `~/.claude.json` blob.

Vault *contents* are now **committed as public documentation** (`vault/` is no longer gitignored).
The Obsidian vault at `vault/agent-smith/` is the canonical, publicly-visible documentation for
the project — it is checked into the repo and tracked by git. Only the generated notes under
`vault/agent-smith/` and any other explicitly-added files are included. Documentation skills
(`docs-backend`/`docs-frontend`) write here via the obsidian MCP, falling back to in-repo `docs/`
when the MCP isn't connected. See [[07-skills-and-commands#Documentation skills]].

---

## Retired servers

The following servers were removed from the registry and are no longer installed by agent-smith.

| Server | Retired | Replacement |
|---|---|---|
| **serena** | 2026-06-29 | Use gitnexus for symbol navigation, call-chain tracing, and impact analysis. Use Read/Glob/Grep for direct file inspection. |

### Automatic cleanup on `configure`

`src/install/mcp-installer.ts` exports a `RETIRED_SERVERS` list (currently `["serena"]`) and two
helpers:

- **`pruneRetiredServers(projectRoot)`** — reads `.mcp.json`, removes any entry whose key
  matches a retired server name, and writes the file back. Called automatically at the start of
  every `configure` run so existing projects are silently de-registered on the next re-configure.
  Idempotent and no-op when the server is already absent.
- **`warnRetiredServerLeftovers(projectRoot)`** — warns (does **not** auto-edit) when a retired
  server is still present in a global Claude config (`~/.claude/.mcp.json` or `~/.claude.json`),
  or when a leftover `.serena/` cache directory exists at the project root. Points the developer
  to manual removal steps so the server does not launch as a ghost. Never touches home-directory
  configs automatically.

Both helpers are best-effort: failures are swallowed and never block `configure`.
