/**
 * Types for Indobase CRM (Zoho-oriented modules).
 * Hand-written — `crm` lives in the tenant DB, not Studio's.
 */

export type CrmRole = 'owner' | 'admin' | 'developer' | 'viewer'
export const CRM_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const

export type CrmLeadStatus = 'Open' | 'Contacted' | 'Qualified' | 'Unqualified' | 'Converted'
export type CrmActivityKind = 'task' | 'call' | 'meeting'
export type CrmActivityStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Cancelled'
export type CrmRelatedModule = 'lead' | 'contact' | 'company' | 'deal'

export type CrmMember = {
  id: string
  gotrue_id: string
  project_ref: string
  email: string
  display_name: string
  role: CrmRole
  created_at: string
}

export type CrmCompany = {
  id: string
  project_ref: string
  name: string
  website: string | null
  industry: string | null
  phone: string | null
  city: string | null
  description: string | null
  created_by: string | null
  created_at: string
  updated_at?: string
}

export type CrmContact = {
  id: string
  project_ref: string
  company_id: string | null
  full_name: string
  email: string | null
  phone: string | null
  title: string | null
  lead_source: string | null
  description: string | null
  created_by: string | null
  created_at: string
  updated_at?: string
}

export type CrmStage = {
  id: string
  project_ref: string
  name: string
  position: number
  is_won: boolean
  is_lost: boolean
}

export type CrmDeal = {
  id: string
  project_ref: string
  stage_id: string
  company_id: string | null
  contact_id: string | null
  title: string
  amount: number | null
  currency: string
  probability: number | null
  closing_date: string | null
  lead_source: string | null
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CrmLead = {
  id: string
  project_ref: string
  full_name: string
  email: string | null
  phone: string | null
  company_name: string | null
  title: string | null
  lead_source: string | null
  status: CrmLeadStatus
  description: string | null
  converted_contact_id: string | null
  converted_company_id: string | null
  converted_deal_id: string | null
  converted_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CrmActivity = {
  id: string
  project_ref: string
  kind: CrmActivityKind
  subject: string
  status: CrmActivityStatus
  due_at: string | null
  description: string | null
  related_module: CrmRelatedModule | null
  related_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CrmNote = {
  id: string
  project_ref: string
  body: string
  related_module: CrmRelatedModule
  related_id: string
  created_by: string | null
  created_at: string
}

export type CrmTag = {
  id: string
  project_ref: string
  name: string
  color: string
  created_at: string
}

export type CrmRecordTag = {
  tag_id: string
  related_module: CrmRelatedModule
  related_id: string
  created_at: string
}

export type CrmAutomationRule = {
  id: string
  project_ref: string
  name: string
  enabled: boolean
  trigger_module: 'lead' | 'deal'
  trigger_value: string
  action_subject: string
  action_kind: CrmActivityKind
  created_by: string | null
  created_at: string
}

export type CrmPipelineReportRow = {
  stage_id: string
  stage_name: string
  deal_count: number
  total_amount: number
  is_won: boolean
  is_lost: boolean
}

export type CrmCompanyInsert = {
  name: string
  website?: string | null
  industry?: string | null
  phone?: string | null
  city?: string | null
  description?: string | null
  created_by?: string | null
}

export type CrmContactInsert = {
  company_id?: string | null
  full_name: string
  email?: string | null
  phone?: string | null
  title?: string | null
  lead_source?: string | null
  description?: string | null
  created_by?: string | null
}

export type CrmDealInsert = {
  stage_id: string
  company_id?: string | null
  contact_id?: string | null
  title: string
  amount?: number | null
  currency?: string
  probability?: number | null
  closing_date?: string | null
  lead_source?: string | null
  description?: string | null
  created_by?: string | null
}

export type CrmLeadInsert = {
  full_name: string
  email?: string | null
  phone?: string | null
  company_name?: string | null
  title?: string | null
  lead_source?: string | null
  status?: CrmLeadStatus
  description?: string | null
  created_by?: string | null
}

export type CrmActivityInsert = {
  kind: CrmActivityKind
  subject: string
  status?: CrmActivityStatus
  due_at?: string | null
  description?: string | null
  related_module?: CrmRelatedModule | null
  related_id?: string | null
  created_by?: string | null
}

export type CrmNoteInsert = {
  body: string
  related_module: CrmRelatedModule
  related_id: string
  created_by?: string | null
}

export type CrmDatabase = {
  crm: {
    Tables: {
      members: {
        Row: CrmMember
        Insert: CrmMember
        Update: Partial<CrmMember>
        Relationships: []
      }
      companies: {
        Row: CrmCompany
        Insert: CrmCompanyInsert
        Update: Partial<CrmCompanyInsert>
        Relationships: []
      }
      contacts: {
        Row: CrmContact
        Insert: CrmContactInsert
        Update: Partial<CrmContactInsert>
        Relationships: []
      }
      stages: {
        Row: CrmStage
        Insert: CrmStage
        Update: Partial<CrmStage>
        Relationships: []
      }
      deals: {
        Row: CrmDeal
        Insert: CrmDealInsert
        Update: Partial<
          Pick<
            CrmDeal,
            | 'stage_id'
            | 'title'
            | 'amount'
            | 'currency'
            | 'company_id'
            | 'contact_id'
            | 'probability'
            | 'closing_date'
            | 'lead_source'
            | 'description'
          >
        >
        Relationships: []
      }
      leads: {
        Row: CrmLead
        Insert: CrmLeadInsert
        Update: Partial<
          Pick<
            CrmLead,
            | 'full_name'
            | 'email'
            | 'phone'
            | 'company_name'
            | 'title'
            | 'lead_source'
            | 'status'
            | 'description'
          >
        >
        Relationships: []
      }
      activities: {
        Row: CrmActivity
        Insert: CrmActivityInsert
        Update: Partial<
          Pick<CrmActivity, 'subject' | 'status' | 'due_at' | 'description' | 'kind'>
        >
        Relationships: []
      }
      notes: {
        Row: CrmNote
        Insert: CrmNoteInsert
        Update: never
        Relationships: []
      }
      tags: {
        Row: CrmTag
        Insert: { name: string; color?: string }
        Update: Partial<Pick<CrmTag, 'name' | 'color'>>
        Relationships: []
      }
      record_tags: {
        Row: CrmRecordTag
        Insert: Pick<CrmRecordTag, 'tag_id' | 'related_module' | 'related_id'>
        Update: never
        Relationships: []
      }
      automation_rules: {
        Row: CrmAutomationRule
        Insert: {
          name: string
          enabled?: boolean
          trigger_module: 'lead' | 'deal'
          trigger_value: string
          action_subject: string
          action_kind?: CrmActivityKind
          created_by?: string | null
        }
        Update: Partial<
          Pick<
            CrmAutomationRule,
            'name' | 'enabled' | 'trigger_module' | 'trigger_value' | 'action_subject' | 'action_kind'
          >
        >
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      convert_lead: {
        Args: {
          p_lead_id: string
          p_deal_title?: string | null
          p_stage_id?: string | null
          p_amount?: number | null
        }
        Returns: {
          contact_id: string | null
          company_id: string | null
          deal_id: string | null
        }
      }
      pipeline_report: {
        Args: Record<string, never>
        Returns: CrmPipelineReportRow[]
      }
    }
  }
}

const STUDIO_ROLE_TO_CRM_ROLE: Record<string, CrmRole> = {
  Owner: 'owner',
  Administrator: 'admin',
  Developer: 'developer',
  'Read-only': 'viewer',
}

export function toCrmRole(role: string | null | undefined): CrmRole {
  if (!role) return 'viewer'
  if ((CRM_ROLES as readonly string[]).includes(role)) return role as CrmRole
  return STUDIO_ROLE_TO_CRM_ROLE[role] ?? 'viewer'
}

export const CRM_LEAD_SOURCES = [
  'Website',
  'Referral',
  'Cold Call',
  'Advertisement',
  'Partner',
  'Trade Show',
  'Other',
] as const

export const CRM_LEAD_STATUSES: CrmLeadStatus[] = [
  'Open',
  'Contacted',
  'Qualified',
  'Unqualified',
  'Converted',
]
