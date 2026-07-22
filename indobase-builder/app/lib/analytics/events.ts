/**
 * Builder-side mirror of the canonical analytics catalogue.
 *
 * `indobase-builder` is not a pnpm workspace member, so it cannot import
 * `packages/common/analytics-events.ts`. This file mirrors the `builder.*` and `deployment.*`
 * groups verbatim. If you change an event name here, change it there too — funnels key off the
 * exact string, and a mismatch silently splits the report in half.
 *
 * Canonical source: packages/common/analytics-events.ts
 */

export const BUILDER_EVENTS = {
  opened: 'builder.opened',
  promptSubmitted: 'builder.prompt_submitted',
  generationStarted: 'builder.generation_started',
  generationCompleted: 'builder.generation_completed',
  generationFailed: 'builder.generation_failed',
  generationStopped: 'builder.generation_stopped',
  regenerateClicked: 'builder.regenerate_clicked',
  codeManuallyEdited: 'builder.code_manually_edited',
  previewReady: 'builder.preview_ready',
  previewFailed: 'builder.preview_failed',
  deployClicked: 'builder.deploy_clicked',
  templateStarted: 'builder.template_started',
} as const;

export const DEPLOYMENT_EVENTS = {
  started: 'deployment.started',
  completed: 'deployment.completed',
  failed: 'deployment.failed',
} as const;

export const BILLING_EVENTS = {
  quotaExceeded: 'billing.quota_exceeded',
  upgradePromptShown: 'billing.upgrade_prompt_shown',
} as const;

/** Shared shape for AI generation events — powers cost/model reporting. */
export type AiGenerationProperties = {
  model?: string;
  provider?: string;
  prompt_length?: number;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  duration_ms?: number;
  retry_count?: number;
  error_type?: string;
  chat_mode?: string;
};
