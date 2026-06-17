import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { setupObsidianVault } from "../../install/obsidian-vault.js";

describe("setupObsidianVault", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-vault-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.OBSIDIAN_VAULT_PATH;
  });

  it("creates the vault directory when OBSIDIAN_VAULT_PATH is set", async () => {
    const vaultPath = path.join(tmpDir, "my-vault");
    process.env.OBSIDIAN_VAULT_PATH = vaultPath;

    const result = await setupObsidianVault(tmpDir, { interactive: false });

    expect(result.vaultPath).toBe(vaultPath);
    expect(result.created).toBe(true);
    expect(fs.existsSync(vaultPath)).toBe(true);
  });

  it("reports created=false when the directory already exists", async () => {
    const vaultPath = path.join(tmpDir, "existing");
    fs.ensureDirSync(vaultPath);
    process.env.OBSIDIAN_VAULT_PATH = vaultPath;

    const result = await setupObsidianVault(tmpDir, { interactive: false });

    expect(result.created).toBe(false);
    expect(fs.existsSync(vaultPath)).toBe(true);
  });

  it("skips (no directory created) when non-interactive and no env var", async () => {
    delete process.env.OBSIDIAN_VAULT_PATH;

    const result = await setupObsidianVault(tmpDir, { interactive: false });

    expect(result.vaultPath).toBeNull();
    expect(result.created).toBe(false);
    // Nothing should have been created under the project root.
    expect(fs.existsSync(path.join(tmpDir, "vault"))).toBe(false);
  });
});
