# Obsidian Vault — agent-smith

This directory is the Obsidian knowledge vault for this project. The `obsidian` MCP
server (`mcp-obsidian`) reads and writes structured documentation here — backend
technical notes, frontend user guides, and architecture decisions produced by the
`docs-*` skills.

## Scope & privacy

The server is registered at Claude Code **local scope** (`~/.claude.json`, keyed by
this repo's path). That means:

- It is **private to each developer** — not committed, not shared on clone.
- Each repo can point at its **own** vault path.
- Run the registration yourself after cloning (see below).

Vault *contents* (notes) are gitignored. Only this README is tracked, so the
directory exists on a fresh clone.

## Register the server (per developer, after clone)

```bash
claude mcp add --scope local --transport stdio obsidian \
  -- npx -y mcp-obsidian "$(pwd)/vault"
```

Verify with `claude mcp list` — `obsidian` should show **Connected**.
