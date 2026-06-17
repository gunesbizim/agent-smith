// Shared "ask, then install" flow used by both `init` and `configure`, so the
// consent + install sequence lives in exactly one place (and is unit-tested once).
import { selectServersToInstall, installMCPs } from "./mcp-installer.js";
import { resolveConsent } from "./install-consent.js";
import type { InstallOptions, InstallSummary } from "./mcp-installer.js";
import type { ConsentOptions, ConsentResult } from "./install-consent.js";

export interface ConsentedInstallResult {
  consent: ConsentResult;
  /** Install summary when approved; null when the install was skipped. */
  summary: InstallSummary | null;
}

/**
 * Resolve the stack-gated server set, ask for consent, and install when approved.
 * Returns the consent decision so the caller can print an appropriate skip message.
 */
export async function installWithConsent(
  installOpts: InstallOptions,
  consentOpts: ConsentOptions,
): Promise<ConsentedInstallResult> {
  const servers = selectServersToInstall(installOpts);
  const consent = await resolveConsent(servers, consentOpts);
  const summary = consent.approved ? await installMCPs(installOpts) : null;
  return { consent, summary };
}
