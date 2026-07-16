import type { components } from 'data/api'

export type SubscriptionTier =
  | 'tier_free'
  | 'tier_basic'
  | 'tier_pro'
  | 'tier_payg'
  | 'tier_studio'
  | 'tier_team'
  | 'tier_enterprise'
  | 'tier_platform'

export type AddonVariantId = components['schemas']['UpdateAddonBody']['addon_variant']

export type OrgSubscription = components['schemas']['GetSubscriptionResponse']

export type ProjectAddon = components['schemas']['GetSubscriptionResponse']['project_addons'][0]

/** Indobase SaaS plan ids (includes legacy `team` = Studio). */
export type PlanId =
  | 'free'
  | 'basic'
  | 'pro'
  | 'studio'
  | 'team'
  | 'enterprise'
  | 'platform'

export type OrgPlan = {
  id: PlanId
  name: string
  price?: number
  is_current?: boolean
  change_type?: 'upgrade' | 'downgrade' | 'none'
}

export type ProjectAddonType = components['schemas']['UpdateAddonBody']['addon_type']

export interface ProjectAddonVariantMeta {
  cpu_cores?: number
  cpu_dedicated?: boolean
  baseline_disk_io_mbs?: number
  max_disk_io_mbs?: number
  memory_gb?: number
  connections_direct?: number
  connections_pooler?: number
  backup_duration_days?: number
  supported_cloud_providers?: string[]
}

export type ProjectSelectedAddon =
  components['schemas']['ProjectAddonsResponse']['selected_addons'][0]
export type ProjectAvailableAddon =
  components['schemas']['ProjectAddonsResponse']['available_addons'][0]
