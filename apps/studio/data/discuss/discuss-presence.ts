import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { RealtimeChannel } from '@indobaseinc/indobase-js'

import {
  getDiscussClient,
  hasDiscussClientVariables,
  type DiscussClientVariables,
} from './discuss-client'

export type DiscussPresenceState = {
  memberId: string
  displayName: string
  onlineAt: string
}

export type DiscussTypingState = {
  memberId: string
  displayName: string
  at: number
}

const TYPING_TTL_MS = 4000

/**
 * Channel presence + typing via Realtime Presence / Broadcast.
 * Ephemeral only — no DB writes. Scoped per Discuss channel.
 */
export function useDiscussPresenceTyping({
  channelId,
  memberId,
  displayName,
  enabled = true,
  ...vars
}: DiscussClientVariables & {
  channelId?: string
  memberId?: string
  displayName?: string
  enabled?: boolean
}) {
  const [online, setOnline] = useState<DiscussPresenceState[]>([])
  const [typing, setTyping] = useState<DiscussTypingState[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled || !channelId || !memberId || !displayName) return
    if (!hasDiscussClientVariables(vars)) return

    const client = getDiscussClient(vars)
    const channel = client.channel(`discuss:presence:${channelId}`, {
      config: { presence: { key: memberId } },
    })

    const syncPresence = () => {
      const state = channel.presenceState<DiscussPresenceState>()
      const next: DiscussPresenceState[] = []
      for (const key of Object.keys(state)) {
        const rows = state[key] ?? []
        for (const row of rows) {
          if (row.memberId) next.push(row)
        }
      }
      setOnline(next)
    }

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const row = payload as DiscussTypingState | undefined
        if (!row?.memberId || row.memberId === memberId) return
        setTyping((prev) => {
          const filtered = prev.filter((item) => item.memberId !== row.memberId)
          return [...filtered, { ...row, at: Date.now() }]
        })
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        await channel.track({
          memberId,
          displayName,
          onlineAt: new Date().toISOString(),
        } satisfies DiscussPresenceState)
      })

    channelRef.current = channel

    const prune = setInterval(() => {
      const cutoff = Date.now() - TYPING_TTL_MS
      setTyping((prev) => prev.filter((item) => item.at >= cutoff))
    }, 1000)

    return () => {
      clearInterval(prune)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      channelRef.current = null
      void client.removeChannel(channel)
      setOnline([])
      setTyping([])
    }
    // Connection fields are stable enough via vars identity from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, memberId, displayName, enabled, vars.projectRef, vars.endpoint, vars.apiKey, vars.gotrueId])

  const notifyTyping = useCallback(() => {
    const channel = channelRef.current
    if (!channel || !memberId || !displayName) return

    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { memberId, displayName, at: Date.now() } satisfies DiscussTypingState,
    })

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      // Local prune only — peers expire via TTL.
    }, TYPING_TTL_MS)
  }, [displayName, memberId])

  const othersOnline = useMemo(
    () => online.filter((row) => row.memberId !== memberId),
    [online, memberId]
  )

  const othersTyping = useMemo(
    () => typing.filter((row) => row.memberId !== memberId),
    [typing, memberId]
  )

  const typingLabel = useMemo(() => {
    if (othersTyping.length === 0) return null
    if (othersTyping.length === 1) return `${othersTyping[0]!.displayName} is typing…`
    if (othersTyping.length === 2) {
      return `${othersTyping[0]!.displayName} and ${othersTyping[1]!.displayName} are typing…`
    }
    return 'Several people are typing…'
  }, [othersTyping])

  return {
    online: othersOnline,
    typing: othersTyping,
    typingLabel,
    notifyTyping,
  }
}
