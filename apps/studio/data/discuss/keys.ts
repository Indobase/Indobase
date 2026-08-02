export const discussKeys = {
  setup: (projectRef: string | undefined) => ['projects', projectRef, 'discuss', 'setup'] as const,
  channels: (projectRef: string | undefined) =>
    ['projects', projectRef, 'discuss', 'channels'] as const,
  members: (projectRef: string | undefined) =>
    ['projects', projectRef, 'discuss', 'members'] as const,
  messages: (projectRef: string | undefined, channelId: string | undefined) =>
    ['projects', projectRef, 'discuss', 'messages', channelId] as const,
  thread: (projectRef: string | undefined, parentId: string | undefined) =>
    ['projects', projectRef, 'discuss', 'thread', parentId] as const,
  search: (
    projectRef: string | undefined,
    query: string | undefined,
    channelId: string | undefined
  ) => ['projects', projectRef, 'discuss', 'search', { query, channelId }] as const,
  sendMessage: () => ['discuss', 'send-message'] as const,
  markRead: () => ['discuss', 'mark-read'] as const,
  reactions: (projectRef: string | undefined, channelId: string | undefined) =>
    ['projects', projectRef, 'discuss', 'reactions', channelId] as const,
  createChannel: () => ['discuss', 'create-channel'] as const,
  openDirect: () => ['discuss', 'open-direct'] as const,
  openGroupDm: () => ['discuss', 'open-group-dm'] as const,
  archiveChannel: () => ['discuss', 'archive-channel'] as const,
  unarchiveChannel: () => ['discuss', 'unarchive-channel'] as const,
  editMessage: () => ['discuss', 'edit-message'] as const,
  deleteMessage: () => ['discuss', 'delete-message'] as const,
  toggleReaction: () => ['discuss', 'toggle-reaction'] as const,
  notifications: (projectRef: string | undefined) =>
    ['projects', projectRef, 'discuss', 'notifications'] as const,
  attachments: (projectRef: string | undefined, channelId: string | undefined) =>
    ['projects', projectRef, 'discuss', 'attachments', channelId] as const,
  archivedChannels: (projectRef: string | undefined) =>
    ['projects', projectRef, 'discuss', 'channels', 'archived'] as const,
}
