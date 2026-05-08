import { RealtimeChannel, RealtimeClient } from '@supabase/realtime-js'
import { sortBy, take } from 'lodash'
import { Dispatch, SetStateAction, useCallback, useEffect, useReducer, useState } from 'react'
import { toast } from 'sonner'

import { useProjectSettingsV2Query } from 'data/config/project-settings-v2-query'
import { uuidv4 } from 'lib/helpers'
import { EMPTY_ARR } from 'lib/void'
import { useRoleImpersonationStateSnapshot } from 'state/role-impersonation-state'
import type { LogData } from './Messages.types'

const DEFAULT_HEADERS = { 'X-Client-Info': 'supabase-js-web/studio' }

function reducer(
  state: LogData[],
  action: { type: 'add'; payload: { messageType: string; metadata: any } } | { type: 'clear' }
) {
  if (action.type === 'clear') {
    return EMPTY_ARR
  }

  const newState = take(
    sortBy(
      [
        {
          id: uuidv4(),
          timestamp: new Date().getTime(),
          message: action.payload.messageType,
          metadata: action.payload.metadata,
        } as LogData,
        ...state,
      ],
      (l) => -l.timestamp
    ),
    100
  )

  return newState
}

export interface RealtimeConfig {
  enabled: boolean
  channelName: string
  projectRef: string
  logLevel: string
  token: string
  schema: string
  table: string
  isChannelPrivate: boolean
  filter: string | undefined
  bearer: string | null
  enableBroadcast: boolean
  enablePresence: boolean
  enableDbChanges: boolean
}

export const useRealtimeMessages = (
  config: RealtimeConfig,
  setRealtimeConfig: Dispatch<SetStateAction<RealtimeConfig>>
) => {
  const {
    enabled,
    channelName,
    projectRef,
    logLevel,
    token,
    schema,
    table,
    isChannelPrivate,
    filter,
    bearer,
    enablePresence,
    enableDbChanges,
    enableBroadcast,
  } = config

  const { data: settings } = useProjectSettingsV2Query({ projectRef: projectRef })

  const protocol = settings?.app_config?.protocol ?? 'https'
  const endpoint = settings?.app_config?.endpoint
  // Default host comes from the public Supabase URL (set via env at build/run
  // time). On cloud this resolves to `<ref>.supabase.co`; on self-hosted
  // (incl. Indobase SaaS) it points to the platform's public Kong URL. Once
  // the project-settings request lands, we switch to its `app_config.endpoint`.
  const fallbackPublicUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  const host = settings
    ? `${protocol}://${endpoint}`
    : fallbackPublicUrl.replace(/\/+$/, '')

  const realtimeUrl = `${host}/realtime/v1`.replace(/^http/i, 'ws')

  const [logData, dispatch] = useReducer(reducer, [] as LogData[])
  const pushMessage = (messageType: string, metadata: any) => {
    dispatch({ type: 'add', payload: { messageType, metadata } })
  }

  // Instantiate our client with the Realtime server and params to connect with
  let [client, setClient] = useState<RealtimeClient>()
  let [channel, setChannel] = useState<RealtimeChannel | undefined>()

  const roleImpersonationState = useRoleImpersonationStateSnapshot()

  useEffect(() => {
    if (!enabled) {
      return
    }

    const options = {
      vsn: '2.0.0',
      headers: DEFAULT_HEADERS,
      params: { apikey: token, log_level: logLevel },
    }
    const realtimeClient = new RealtimeClient(realtimeUrl, options)

    if (bearer) {
      realtimeClient.setAuth(bearer)
    }

    setClient(realtimeClient)
    return () => {
      realtimeClient.disconnect()
      setClient(undefined)
    }
  }, [enabled, bearer, host, logLevel, token])

  useEffect(() => {
    if (!client) {
      return
    }
    dispatch({ type: 'clear' })
    // Namespace the channel topic with the project_ref so two projects on the
    // same shared Realtime tenant can never collide. Customer apps that connect
    // via supabase-js do this automatically because their `apikey` JWT carries
    // a `project_ref` claim, but the Inspector lets users pick arbitrary topic
    // names — without the prefix, a user in project P1 subscribing to "lobby"
    // would receive broadcasts from project P2's "lobby".
    const namespacedChannelName = channelName?.startsWith(`${projectRef}:`)
      ? channelName
      : `${projectRef}:${channelName}`
    const newChannel = client?.channel(namespacedChannelName, {
      config: { broadcast: { self: true }, private: isChannelPrivate },
    })
    // Hack to confirm Postgres is subscribed
    // Need to add 'extension' key in the 'payload'
    newChannel.on('system' as any, {} as any, (payload: any) => {
      pushMessage('SYSTEM', payload)
    })

    if (enableBroadcast) {
      // Listen for all (`*`) `broadcast` messages
      // The message name can by anything
      // Match on specific message names to filter for only those types of messages and do something with them
      newChannel.on('broadcast', { event: '*' }, (payload) => pushMessage('BROADCAST', payload))
    }

    // Listen for all (`*`) `presence` messages
    if (enablePresence) {
      newChannel.on('presence' as any, { event: '*' }, (payload) => {
        pushMessage('PRESENCE', payload)
      })
    }

    if (enableDbChanges) {
      let postgres_changes_opts: any = {
        event: '*',
        schema: schema,
        table: table,
        filter: undefined,
      }
      if (filter !== '') {
        postgres_changes_opts.filter = filter
      }
      newChannel.on('postgres_changes' as any, postgres_changes_opts, (payload: any) => {
        let ts = performance.now() + performance.timeOrigin
        let payload_ts = Date.parse(payload.commit_timestamp)
        let latency = ts - payload_ts
        pushMessage('POSTGRES', { ...payload, latency })
      })
    }

    // Finally, subscribe to the Channel we just setup
    newChannel.subscribe(async (status, err) => {
      if (status === 'SUBSCRIBED') {
        // Let LiveView know we connected so we can update the button text
        // pushMessageTo('#conn_info', 'broadcast_subscribed', { host: host })

        const role = roleImpersonationState.role?.role
        const computedRole =
          role === undefined
            ? 'service_role_'
            : role === 'anon'
              ? 'anon_role_'
              : role === 'authenticated'
                ? 'authenticated_role_'
                : 'user_name_'

        if (enablePresence) {
          const name = computedRole + Math.floor(Math.random() * 100)
          newChannel.send({
            type: 'presence',
            event: 'TRACK',
            payload: { name: name, t: performance.now() },
          })
        }
      } else if (status === 'CHANNEL_ERROR') {
        if (err?.message) {
          toast.error(`Failed to connect with the following error: ${err.message}`)
        } else {
          toast.error(`Failed to connect. Please check your RLS policies and try again.`)
        }

        newChannel.unsubscribe()
        setChannel(undefined)
        setRealtimeConfig({ ...config, channelName: '', enabled: false })
      }
    })

    setChannel(newChannel)
    return () => {
      newChannel.unsubscribe()
      setChannel(undefined)
    }
  }, [
    client,
    channelName,
    projectRef,
    enableBroadcast,
    enableDbChanges,
    enablePresence,
    filter,
    host,
    schema,
    table,
  ])

  const sendMessage = useCallback(
    async (message: string, payload: any, callback: () => void) => {
      if (channel) {
        const res = await channel.send({
          type: 'broadcast',
          event: message,
          payload,
        })
        if (res === 'error') {
          toast.error('Failed to broadcast message')
        } else {
          toast.success('Successfully broadcasted message')
          callback()
        }
      } else {
        toast.error('Failed to broadcast message: channel has not been set')
      }
    },
    [channel]
  )
  return { logData, sendMessage }
}
