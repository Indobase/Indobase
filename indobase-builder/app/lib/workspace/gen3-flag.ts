/**
 * Builder Gen 3 — Commands ownership flag.
 *
 * When enabled, durable file mutations commit via
 * MutationProposal → applyProposalsViaCommands → WorkspaceService
 * (ActionRunner stays a WebContainer / preview compatibility adapter only).
 *
 * Default OFF so production classic path is unchanged.
 *
 * Env: `BUILDER_GEN3_COMMANDS=1` (server / tests) or `VITE_BUILDER_GEN3_COMMANDS=1` (client).
 *
 * @see docs/BUILDER-GEN3.md
 */

function envTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/** Test / harness override — prefer this over mutating process.env in parallel suites. */
let forcedEnabled: boolean | undefined;

export function setBuilderGen3CommandsEnabledForTests(enabled: boolean | undefined): void {
  forcedEnabled = enabled;
}

export function isBuilderGen3CommandsEnabled(): boolean {
  if (forcedEnabled !== undefined) {
    return forcedEnabled;
  }

  if (typeof process !== 'undefined' && envTruthy(process.env.BUILDER_GEN3_COMMANDS)) {
    return true;
  }

  try {
    if (envTruthy(import.meta.env.VITE_BUILDER_GEN3_COMMANDS as string | undefined)) {
      return true;
    }
  } catch {
    // Non-Vite contexts (plain node vitest without import.meta.env).
  }

  return false;
}
