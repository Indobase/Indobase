import { describe, expect, it } from 'vitest'

import { directChannelLabel, sortChannels, splitMentions } from './Discuss.utils'
import type { DiscussChannelWithUnread } from 'data/discuss/discuss.types'

const channel = (
  partial: Partial<DiscussChannelWithUnread> & Pick<DiscussChannelWithUnread, 'id' | 'kind' | 'name'>
): DiscussChannelWithUnread => ({
  project_ref: 'proj',
  slug: partial.slug ?? partial.name.toLowerCase(),
  topic: null,
  is_private: partial.kind === 'direct',
  created_by: null,
  created_at: new Date().toISOString(),
  archived_at: null,
  unread: 0,
  last_message_at: null,
  ...partial,
})

describe('Discuss.utils slack helpers', () => {
  it('sortChannels puts standard, then DMs, then activity', () => {
    const sorted = sortChannels([
      channel({ id: '1', kind: 'activity', name: 'Activity' }),
      channel({ id: '2', kind: 'direct', name: 'Direct message' }),
      channel({ id: '3', kind: 'standard', name: 'General' }),
    ])
    expect(sorted.map((row) => row.kind)).toEqual(['standard', 'direct', 'activity'])
  })

  it('directChannelLabel prefers the other member name', () => {
    const label = directChannelLabel(
      channel({ id: 'dm', kind: 'direct', name: 'Direct message' }),
      [
        {
          id: 'me',
          gotrue_id: 'g1',
          project_ref: 'proj',
          email: 'me@example.com',
          display_name: 'Me',
          avatar_url: null,
          role: 'owner',
          created_at: '',
          last_seen_at: null,
        },
        {
          id: 'them',
          gotrue_id: 'g2',
          project_ref: 'proj',
          email: 'them@example.com',
          display_name: 'Priya',
          avatar_url: null,
          role: 'developer',
          created_at: '',
          last_seen_at: null,
        },
      ],
      'me'
    )
    expect(label).toBe('Priya')
  })

  it('sortChannels puts groups with DMs', () => {
    const sorted = sortChannels([
      channel({ id: '1', kind: 'activity', name: 'Activity' }),
      channel({ id: '2', kind: 'group', name: 'Priya, Sam', is_private: true }),
      channel({ id: '3', kind: 'standard', name: 'General' }),
    ])
    expect(sorted.map((row) => row.kind)).toEqual(['standard', 'group', 'activity'])
  })

  it('directChannelLabel uses group channel name', () => {
    expect(
      directChannelLabel(
        channel({ id: 'g', kind: 'group', name: 'Priya, Sam', is_private: true }),
        [],
        'me'
      )
    ).toBe('Priya, Sam')
  })

  it('splitMentions highlights @names', () => {
    expect(splitMentions('Hey @Priya check this')).toEqual([
      { type: 'text', value: 'Hey ' },
      { type: 'mention', value: '@Priya' },
      { type: 'text', value: ' check this' },
    ])
    expect(splitMentions('Hey @Priya Shah hi', ['Priya Shah', 'Priya'])).toEqual([
      { type: 'text', value: 'Hey ' },
      { type: 'mention', value: '@Priya Shah' },
      { type: 'text', value: ' hi' },
    ])
  })
})
