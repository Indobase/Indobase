/**
 * Canonical Indobase analytics event catalogue.
 *
 * One source of truth for event names and their property shapes across Studio, www, and Builder.
 * Funnels, cohorts, and dashboards all key off exact event names — if two surfaces spell the same
 * action differently ("prompt_submitted" vs "promptSubmitted"), every downstream report silently
 * splits in half. Import from here rather than passing string literals to capture().
 *
 * Naming: `domain.action_in_past_tense`, snake_case. Properties are snake_case too, matching
 * PostHog convention so they group cleanly in the UI.
 *
 * NOTE: `indobase-builder` is not a pnpm workspace member, so it keeps a mirrored copy at
 * `indobase-builder/app/lib/analytics/events.ts`. Keep the two in sync — the mirror re-states this.
 */

export const ANALYTICS_EVENTS = {
  // ── Authentication ────────────────────────────────────────────────────────────────────────────
  auth: {
    signedUp: 'auth.signed_up',
    loggedIn: 'auth.logged_in',
    loggedOut: 'auth.logged_out',
    emailVerified: 'auth.email_verified',
    oauthLogin: 'auth.oauth_login',
    accountDeleted: 'auth.account_deleted',
  },

  // ── Projects ──────────────────────────────────────────────────────────────────────────────────
  project: {
    created: 'project.created',
    deleted: 'project.deleted',
    renamed: 'project.renamed',
    shared: 'project.shared',
    paused: 'project.paused',
    restored: 'project.restored',
  },

  // ── Builder (AI generation) ───────────────────────────────────────────────────────────────────
  builder: {
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
  },

  // ── Studio (backend) ──────────────────────────────────────────────────────────────────────────
  studio: {
    opened: 'studio.opened',
    databaseCreated: 'studio.database_created',
    tableCreated: 'studio.table_created',
    rowInserted: 'studio.row_inserted',
    sqlEditorOpened: 'studio.sql_editor_opened',
    sqlQueryRun: 'studio.sql_query_run',
    authEnabled: 'studio.auth_enabled',
    storageBucketCreated: 'studio.storage_bucket_created',
    storageUploaded: 'studio.storage_uploaded',
    edgeFunctionCreated: 'studio.edge_function_created',
    functionDeployed: 'studio.function_deployed',
    realtimeEnabled: 'studio.realtime_enabled',
    envVarAdded: 'studio.env_var_added',
    backupRestored: 'studio.backup_restored',
  },

  // ── Deployment / publish ──────────────────────────────────────────────────────────────────────
  deployment: {
    started: 'deployment.started',
    completed: 'deployment.completed',
    failed: 'deployment.failed',
    customDomainAdded: 'deployment.custom_domain_added',
  },

  // ── Billing ───────────────────────────────────────────────────────────────────────────────────
  billing: {
    trialStarted: 'billing.trial_started',
    trialExpired: 'billing.trial_expired',
    upgraded: 'billing.upgraded',
    downgraded: 'billing.downgraded',
    cancelled: 'billing.subscription_cancelled',
    paymentFailed: 'billing.payment_failed',
    couponUsed: 'billing.coupon_used',
    upgradePromptShown: 'billing.upgrade_prompt_shown',
    quotaExceeded: 'billing.quota_exceeded',
  },

  // ── Activation ────────────────────────────────────────────────────────────────────────────────
  activation: {
    milestone: 'user.activation_milestone',
    activated: 'user.activated',
  },

  // ── Teams / organizations ─────────────────────────────────────────────────────────────────────
  team: {
    created: 'team.created',
    memberInvited: 'team.member_invited',
    memberJoined: 'team.member_joined',
    roleChanged: 'team.role_changed',
  },

  // ── API / platform health ─────────────────────────────────────────────────────────────────────
  api: {
    rateLimitHit: 'api.rate_limit_hit',
    requestFailed: 'api.request_failed',
  },
} as const

/** Every valid event name, derived from the catalogue so it can never drift. */
type EventGroup = typeof ANALYTICS_EVENTS
export type AnalyticsEventName = {
  [G in keyof EventGroup]: EventGroup[G][keyof EventGroup[G]]
}[keyof EventGroup]

/**
 * Properties for AI generation events. Cost and token counts are what make spend-per-user and
 * model-comparison reporting possible, so they are first-class rather than ad-hoc.
 */
export type AiGenerationProperties = {
  model?: string
  provider?: string
  prompt_length?: number
  tokens_in?: number
  tokens_out?: number
  cost_usd?: number
  duration_ms?: number
  retry_count?: number
  /** Present on failures — a short, non-PII reason code. */
  error_type?: string
  /** 'build' | 'discuss' — which mode the user was in. */
  chat_mode?: string
}

/** Properties attached to deployment events. */
export type DeploymentProperties = {
  duration_ms?: number
  target?: string
  error_type?: string
}

/**
 * Person properties set via identify(). Keep this free of PII beyond what is already in the
 * account record — no raw emails in properties; PostHog holds the distinct_id for that.
 */
export type IdentifyProperties = {
  plan?: string
  organization_slug?: string
  role?: string
  country?: string
  signup_source?: string
  framework?: string
  is_team?: boolean
}
