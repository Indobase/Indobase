/**
 * Types for Indobase Discuss.
 *
 * These mirror `indobase-discuss/db/001_discuss_schema.sql` exactly. They are hand-written rather
 * than generated because the `discuss` schema lives in the tenant database, not in Studio's own,
 * so there is no generation step that runs against it during a Studio build.
 *
 * Everything here is a `type` alias rather than an `interface` on purpose: realtime-js constrains
 * its payload generics with `T extends { [key: string]: any }`, and interfaces do not get the
 * implicit index signature that constraint needs.
 */

/** JSON value, for `messages.event_data`. */
export type DiscussJson =
  | string
  | number
  | boolean
  | null
  | { [key: string]: DiscussJson | undefined }
  | DiscussJson[]

/**
 * Mirrors Studio's org role. Authorisation decisions belong to Studio; the copy in
 * `discuss.members.role` exists for rendering and for the RLS predicates.
 * `viewer` is read-only — enforced by the `messages_write` policy, not by this type.
 */
export type DiscussRole = 'owner' | 'admin' | 'developer' | 'viewer'

export const DISCUSS_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const

/**
 * 'standard' = human conversation. 'activity' = platform event stream, rendered as cards.
 * 'direct' = 1:1 DM between two project members (always private).
 * 'group' = multi-person private conversation.
 */
export type DiscussChannelKind = 'standard' | 'activity' | 'direct' | 'group'

export const DISCUSS_CHANNEL_KINDS = ['standard', 'activity', 'direct', 'group'] as const

// ── Rows ────────────────────────────────────────────────────────────────────────────────────────

export type DiscussMember = {
  id: string
  gotrue_id: string
  project_ref: string
  email: string
  display_name: string
  avatar_url: string | null
  role: DiscussRole
  created_at: string
  last_seen_at: string | null
}

export type DiscussChannel = {
  id: string
  project_ref: string
  /** URL-safe and stable. Renaming `name` never changes this — permalinks outlive names. */
  slug: string
  name: string
  topic: string | null
  kind: DiscussChannelKind
  is_private: boolean
  created_by: string | null
  created_at: string
  archived_at: string | null
}

export type DiscussChannelMember = {
  channel_id: string
  member_id: string
  joined_at: string
}

export type DiscussMessage = {
  id: string
  channel_id: string
  /**
   * Denormalised from `channels` so RLS can filter without a join. Set by the
   * `messages_set_project_ref` trigger — never by application code.
   */
  project_ref: string
  author_id: string | null
  /** Null author + non-null event_type = a platform event (deploy, payment, build). */
  event_type: string | null
  event_data: DiscussJson | null
  body: string | null
  /** Threads are one level deep on purpose. A reply never has replies. */
  parent_id: string | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
}

export type DiscussReadState = {
  channel_id: string
  member_id: string
  last_read_at: string
}

export type DiscussAttachment = {
  id: string
  message_id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  created_at: string
}

export type DiscussReaction = {
  message_id: string
  member_id: string
  emoji: string
  created_at: string
}

export type DiscussNotificationKind = 'mention' | 'dm' | 'reply' | 'system'

export type DiscussNotification = {
  id: string
  member_id: string
  project_ref: string
  channel_id: string | null
  message_id: string | null
  kind: DiscussNotificationKind
  title: string
  body: string | null
  read_at: string | null
  created_at: string
}

/** Aggregated reaction for transcript rendering. */
export type DiscussReactionCount = {
  message_id: string
  emoji: string
  count: number
  reacted_by_me: boolean
}

/** Row shape of `discuss.unread_counts()`. */
export type DiscussUnreadCount = {
  channel_id: string
  unread: number
  last_message_at: string | null
}

/** A channel as the sidebar renders it: the row plus its unread state. */
export type DiscussChannelWithUnread = DiscussChannel & {
  unread: number
  last_message_at: string | null
}

// ── Insert payloads ─────────────────────────────────────────────────────────────────────────────

/**
 * `project_ref` is deliberately typed as `never`: the `messages_set_project_ref` trigger derives it
 * from the channel, and RLS on messages trusts that column. Application code that could set it
 * would turn a bug into a cross-tenant leak, so the type makes it unwritable.
 *
 * `search_vector` is a generated column and is likewise absent.
 */
export type DiscussMessageInsert = {
  channel_id: string
  author_id?: string | null
  event_type?: string | null
  event_data?: DiscussJson | null
  body?: string | null
  parent_id?: string | null
  project_ref?: never
}

export type DiscussReadStateInsert = {
  channel_id: string
  member_id: string
  last_read_at?: string
}

// ── Database type for the PostgREST client ──────────────────────────────────────────────────────

/**
 * The row that PostgREST actually returns for `discuss.messages`, including the generated
 * `search_vector` column (serialised as a string). Queries never select it, but `searchMessages`
 * filters on it, so it has to be part of the client's row type.
 */
type DiscussMessageRow = DiscussMessage & { search_vector: string }

/**
 * Shape expected by `createClient<Database, SchemaName>`.
 *
 * `discuss.ensure_project_setup` and `discuss.publish_event` are intentionally absent from
 * `Functions`: both are SECURITY DEFINER and `revoke all ... from public`, so they are not callable
 * over PostgREST as `authenticated` and must never be exposed that way — a caller could otherwise
 * pass any `project_ref`.
 */
export type DiscussDatabase = {
  discuss: {
    Tables: {
      members: {
        Row: DiscussMember
        Insert: DiscussMember
        Update: Partial<DiscussMember>
        Relationships: []
      }
      channels: {
        Row: DiscussChannel
        Insert: DiscussChannel
        Update: Partial<DiscussChannel>
        Relationships: []
      }
      channel_members: {
        Row: DiscussChannelMember
        Insert: DiscussChannelMember
        Update: Partial<DiscussChannelMember>
        Relationships: []
      }
      messages: {
        Row: DiscussMessageRow
        Insert: DiscussMessageInsert
        Update: Partial<Pick<DiscussMessage, 'body' | 'edited_at' | 'deleted_at'>>
        Relationships: []
      }
      read_state: {
        Row: DiscussReadState
        Insert: DiscussReadStateInsert
        Update: Partial<DiscussReadState>
        Relationships: []
      }
      attachments: {
        Row: DiscussAttachment
        Insert: {
          message_id: string
          storage_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          id?: string
          created_at?: string
        }
        Update: Partial<DiscussAttachment>
        Relationships: []
      }
      reactions: {
        Row: DiscussReaction
        Insert: Pick<DiscussReaction, 'message_id' | 'member_id' | 'emoji'>
        Update: never
        Relationships: []
      }
      notifications: {
        Row: DiscussNotification
        Insert: DiscussNotification
        Update: Partial<Pick<DiscussNotification, 'read_at'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      unread_counts: {
        Args: Record<string, never>
        Returns: DiscussUnreadCount[]
      }
      reaction_counts: {
        Args: { p_message_ids: string[] }
        Returns: DiscussReactionCount[]
      }
      create_channel: {
        Args: {
          p_project_ref: string
          p_name: string
          p_topic?: string | null
          p_is_private?: boolean
        }
        Returns: string
      }
      open_direct_channel: {
        Args: { p_project_ref: string; p_other_member_id: string }
        Returns: string
      }
      open_group_dm: {
        Args: { p_project_ref: string; p_member_ids: string[]; p_name?: string | null }
        Returns: string
      }
      archive_channel: {
        Args: { p_channel_id: string }
        Returns: string
      }
      unarchive_channel: {
        Args: { p_channel_id: string }
        Returns: string
      }
    }
  }
}

// ── Role mapping ────────────────────────────────────────────────────────────────────────────────

const STUDIO_ROLE_TO_DISCUSS_ROLE: Record<string, DiscussRole> = {
  Owner: 'owner',
  Administrator: 'admin',
  Developer: 'developer',
  'Read-only': 'viewer',
}

/**
 * Maps a Studio organization role name (see `FIXED_ROLE_ORDER` in
 * `data/organization-members/organization-roles-query`) onto the role vocabulary
 * `discuss.ensure_project_setup` accepts. Already-lowercase values pass through.
 *
 * Falls back to `viewer` — the read-only role — so an unrecognised role can never accidentally
 * grant write access.
 */
export function toDiscussRole(role: string | null | undefined): DiscussRole {
  if (!role) return 'viewer'
  if ((DISCUSS_ROLES as readonly string[]).includes(role)) return role as DiscussRole
  return STUDIO_ROLE_TO_DISCUSS_ROLE[role] ?? 'viewer'
}
