import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  applyTeamChannelPlan,
  channelsToCreate,
  channelsToRelabel,
  DISCUSS_DEFAULT_CHANNEL_SLUG,
  DISCUSS_OFF_TOPIC_SLUG,
  DISCUSS_TEAM_CHANNELS,
  humanizeTitle,
  looksLikeInternalKey,
  OFF_TOPIC_REPLACEMENT_DISPLAY_NAME,
  planOffTopicAction,
  shouldRelabelChannel,
  type MmApiCall,
} from './channel-plan.js'

// ── plan shape ───────────────────────────────────────────────────────────────

test('plan covers the project-first channel set with human labels', () => {
  const slugs = DISCUSS_TEAM_CHANNELS.map((c) => c.name)
  assert.deepEqual(slugs, [
    'town-square',
    'announcements',
    'support',
    'development',
    'design',
    'marketing',
  ])
  // town-square is the server's hardcoded default channel: relabel, never create.
  assert.deepEqual(
    channelsToRelabel().map((c) => c.name),
    [DISCUSS_DEFAULT_CHANNEL_SLUG]
  )
  assert.equal(channelsToCreate().length, 5)
  for (const entry of DISCUSS_TEAM_CHANNELS) {
    assert.match(entry.displayName, /^[A-Z][A-Za-z ]+$/, `${entry.name} label must be human`)
    assert.equal(looksLikeInternalKey(entry.displayName), false)
    assert.match(entry.name, /^[a-z][a-z0-9-]*$/)
  }
  assert.equal(
    DISCUSS_TEAM_CHANNELS.find((c) => c.name === DISCUSS_DEFAULT_CHANNEL_SLUG)?.displayName,
    'General'
  )
})

// ── humanizeTitle ────────────────────────────────────────────────────────────

test('humanizeTitle keeps human input verbatim', () => {
  assert.equal(humanizeTitle('My App', 'Project'), 'My App')
  assert.equal(humanizeTitle('  Acme  Inc  ', 'Organization'), 'Acme Inc')
  assert.equal(humanizeTitle('iOS', 'Project'), 'iOS')
})

test('humanizeTitle never surfaces an internal key', () => {
  assert.equal(humanizeTitle('ib-proj-92834', 'Project'), '92834')
  assert.equal(humanizeTitle('ib-org-acme-co', 'Organization'), 'Acme Co')
  assert.equal(humanizeTitle('ib-proj-', 'Project'), 'Project')
})

test('humanizeTitle falls back and title-cases slugs', () => {
  assert.equal(humanizeTitle('', 'Project'), 'Project')
  assert.equal(humanizeTitle(undefined, 'Project'), 'Project')
  assert.equal(humanizeTitle(null, 'Organization'), 'Organization')
  assert.equal(humanizeTitle('my-app_v2', 'Project'), 'My App V2')
  assert.equal(humanizeTitle('x'.repeat(120), 'Project').length, 64)
})

// ── relabel guard ────────────────────────────────────────────────────────────

test('shouldRelabelChannel only overwrites upstream or machine labels', () => {
  assert.equal(shouldRelabelChannel('town-square', 'Town Square', 'General'), true)
  assert.equal(shouldRelabelChannel('town-square', 'town square', 'General'), true)
  assert.equal(shouldRelabelChannel('town-square', '', 'General'), true)
  assert.equal(shouldRelabelChannel('ib-proj-abc', 'ib-proj-abc', 'My App'), true)
  assert.equal(shouldRelabelChannel('ib-proj-abc', 'ib-proj-legacy', 'My App'), true)
  // A human already named it — leave it alone.
  assert.equal(shouldRelabelChannel('town-square', 'Company Wide', 'General'), false)
  assert.equal(shouldRelabelChannel('ib-proj-abc', 'My App', 'My App'), false)
  assert.equal(shouldRelabelChannel('ib-proj-abc', 'Renamed By Admin', 'My App'), false)
  assert.equal(shouldRelabelChannel('town-square', 'Town Square', '   '), false)
})

// ── off-topic ────────────────────────────────────────────────────────────────

test('planOffTopicAction archives only an untouched Off-Topic', () => {
  assert.equal(planOffTopicAction({ display_name: 'Off-Topic', total_msg_count: 0 }), 'archive')
  assert.equal(planOffTopicAction({ display_name: 'Off-Topic', total_msg_count: 12 }), 'relabel')
  // Missing counter → assume there is content worth keeping.
  assert.equal(planOffTopicAction({ display_name: 'Off-Topic' }), 'relabel')
  assert.equal(planOffTopicAction({ display_name: 'Water Cooler', total_msg_count: 0 }), 'none')
  assert.equal(planOffTopicAction(null), 'none')
})

// ── executor ─────────────────────────────────────────────────────────────────

type Call = { path: string; method: string; body?: Record<string, unknown> }

function fakeApi(channels: Record<string, Record<string, unknown>>) {
  const calls: Call[] = []
  const api: MmApiCall = async (path, init) => {
    const method = init?.method ?? 'GET'
    calls.push({ path, method, body: init?.body as Record<string, unknown> | undefined })
    const lookup = /^\/api\/v4\/teams\/[^/]+\/channels\/name\/(.+)$/.exec(path)
    if (lookup) {
      const found = channels[lookup[1]]
      return found ? { status: 200, json: found } : { status: 404, json: { id: 'not-found' } }
    }
    if (path === '/api/v4/channels' && method === 'POST') return { status: 201, json: { id: 'c1' } }
    if (path.endsWith('/patch')) return { status: 200, json: {} }
    if (method === 'DELETE') return { status: 200, json: {} }
    return { status: 404, json: null }
  }
  return { api, calls }
}

test('applyTeamChannelPlan reshapes a freshly created team', async () => {
  const { api, calls } = fakeApi({
    'town-square': { id: 'ts1', display_name: 'Town Square', total_msg_count: 0 },
    'off-topic': { id: 'ot1', display_name: 'Off-Topic', total_msg_count: 0 },
  })
  const result = await applyTeamChannelPlan(api, 'team1')

  assert.deepEqual(result.relabeled, ['town-square'])
  assert.deepEqual(result.archived, ['off-topic'])
  assert.deepEqual(result.created, ['announcements', 'support', 'development', 'design', 'marketing'])
  assert.deepEqual(result.failed, [])

  // town-square is patched, never recreated, and its slug is untouched.
  const tsPatch = calls.find((c) => c.path === '/api/v4/channels/ts1/patch')
  assert.ok(tsPatch)
  assert.equal(tsPatch.method, 'PUT')
  assert.equal(tsPatch.body?.display_name, 'General')
  assert.equal('name' in (tsPatch.body ?? {}), false)

  // Created channels carry clean slugs and human labels.
  const created = calls.filter((c) => c.path === '/api/v4/channels' && c.method === 'POST')
  assert.equal(created.length, 5)
  for (const c of created) {
    assert.equal(c.body?.type, 'O')
    assert.match(String(c.body?.name), /^[a-z][a-z0-9-]*$/)
    assert.equal(looksLikeInternalKey(String(c.body?.display_name)), false)
  }
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path === '/api/v4/channels/ot1'))
})

test('applyTeamChannelPlan is idempotent and respects admin renames', async () => {
  const existing: Record<string, Record<string, unknown>> = {
    'town-square': { id: 'ts1', display_name: 'Company Wide', total_msg_count: 40 },
    'off-topic': { id: 'ot1', display_name: 'Water Cooler', total_msg_count: 9 },
  }
  for (const entry of channelsToCreate()) {
    existing[entry.name] = { id: `c-${entry.name}`, display_name: entry.displayName }
  }
  const { api, calls } = fakeApi(existing)
  const result = await applyTeamChannelPlan(api, 'team1')

  assert.deepEqual(result.created, [])
  assert.deepEqual(result.relabeled, [])
  assert.deepEqual(result.archived, [])
  assert.deepEqual(result.failed, [])
  assert.equal(
    calls.every((c) => c.method === 'GET'),
    true,
    'a settled team must only be read, never mutated'
  )
})

test('applyTeamChannelPlan relabels an Off-Topic that already has messages', async () => {
  const { api, calls } = fakeApi({
    'town-square': { id: 'ts1', display_name: 'Town Square', total_msg_count: 0 },
    'off-topic': { id: 'ot1', display_name: 'Off-Topic', total_msg_count: 3 },
  })
  const result = await applyTeamChannelPlan(api, 'team1')
  assert.deepEqual(result.archived, [])
  assert.ok(result.relabeled.includes(DISCUSS_OFF_TOPIC_SLUG))
  assert.equal(
    calls.some((c) => c.method === 'DELETE'),
    false,
    'a channel with messages must never be archived'
  )
  const patch = calls.find((c) => c.path === '/api/v4/channels/ot1/patch')
  assert.equal(patch?.body?.display_name, OFF_TOPIC_REPLACEMENT_DISPLAY_NAME)
  assert.equal('name' in (patch?.body ?? {}), false)
})

test('applyTeamChannelPlan never throws when the API is down', async () => {
  const api: MmApiCall = async () => {
    throw new Error('upstream unreachable')
  }
  const result = await applyTeamChannelPlan(api, 'team1')
  assert.equal(result.created.length, 0)
  assert.ok(result.failed.length > 0)
  // No team id → no calls at all.
  assert.deepEqual(await applyTeamChannelPlan(api, ''), {
    created: [],
    relabeled: [],
    archived: [],
    unchanged: [],
    failed: [],
  })
})

// ── bootstrap parity ─────────────────────────────────────────────────────────

test('docker/bootstrap-mattermost.sh mirrors the channel plan', () => {
  const shell = readFileSync(
    new URL('../../docker/bootstrap-mattermost.sh', import.meta.url),
    'utf8'
  )

  const listed = /INDOBASE_TEAM_CHANNELS='([^']*)'/.exec(shell)
  assert.ok(listed, 'bootstrap must declare INDOBASE_TEAM_CHANNELS')
  const fromShell = listed[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, displayName, purpose] = line.split('|')
      return { name, displayName, purpose }
    })
  assert.deepEqual(
    fromShell,
    channelsToCreate().map(({ name, displayName, purpose }) => ({ name, displayName, purpose }))
  )

  const general = /INDOBASE_GENERAL_DISPLAY='([^']*)'/.exec(shell)
  assert.equal(general?.[1], channelsToRelabel()[0].displayName)
  const offTopic = /INDOBASE_OFF_TOPIC_DISPLAY='([^']*)'/.exec(shell)
  assert.equal(offTopic?.[1], OFF_TOPIC_REPLACEMENT_DISPLAY_NAME)

  // A slug is a deep link. Every /patch payload must be display_name only —
  // rewriting `name` would break existing links (and town-square's slug is
  // load-bearing server-side). Bodies sit on the line after the path.
  const lines = shell.split('\n')
  lines.forEach((line, i) => {
    if (!line.includes('/patch"')) return
    const payload = `${line}\n${lines[i + 1] ?? ''}`
    assert.equal(
      payload.includes('\\"name\\"'),
      false,
      `channel patch must not rewrite a slug: ${line.trim()}`
    )
  })
  assert.ok(shell.includes(`channels/name/${DISCUSS_OFF_TOPIC_SLUG}`))
  assert.ok(shell.includes(`channels/name/${DISCUSS_DEFAULT_CHANNEL_SLUG}`))
})
