import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  generateContextualFollowUps,
  normalizeFollowUpHistory,
  parseGeneratedFollowUpsJson,
} from './followups-ai.ts'
import { looksLikeCannedAppTypeCatalog, looksLikeCannedCatalogChips } from './followups.ts'

describe('followups AI', () => {
  it('parses model JSON and rejects short catalogs', () => {
    const parsed = parseGeneratedFollowUpsJson(`{
      "title": "What will Aural sell?",
      "items": [
        { "label": "Over-ear headphones", "message": "Build a store for over-ear headphones" },
        { "label": "I'll describe products", "message": "I'll describe the catalog next" },
        { "label": "Start with 6 SKUs", "message": "Invent six headphone products and preview the shop" }
      ]
    }`)
    assert.ok(parsed)
    assert.equal(parsed.title, 'What will Aural sell?')
    assert.equal(parsed.items.length, 3)
    assert.match(parsed.items[0].label, /headphones/i)
  })

  it('strips fences and ignores tool names in chip messages', () => {
    const parsed = parseGeneratedFollowUpsJson(`\`\`\`json
{"title":"Next","items":[
  {"label":"Go Live on Indobase","message":"Call launchBusiness now"},
  {"label":"Change the hero","message":"Change the hero"}
]}
\`\`\``)
    assert.ok(parsed)
    assert.equal(parsed.items[0].message, 'Launch my store on Indobase now.')
    assert.doesNotMatch(parsed.items.map((i) => i.message).join(' '), /launchBusiness/)
  })

  it('requires at least two chips', () => {
    assert.equal(
      parseGeneratedFollowUpsJson(`{"title":"Next","items":[{"label":"Go Live","message":"Launch"}]}`),
      null,
    )
  })

  it('keeps last 16 turns and appends assistant text', () => {
    const history = normalizeFollowUpHistory(
      [
        { role: 'user', content: 'I want to launch an online store' },
        { role: 'assistant', content: 'Finish account setup first.' },
      ],
      'What will your store sell?',
    )
    assert.equal(history.length, 3)
    assert.equal(history[0].role, 'user')
    assert.equal(history[2].content, 'What will your store sell?')
  })

  it('generates chips from mocked OpenRouter and chat history', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'What will this store sell?',
                  items: [
                    { label: 'Headphones', message: 'Build a headphone storefront' },
                    { label: 'Audio accessories', message: 'Build a store for audio accessories' },
                    { label: "I'll type my niche", message: "I'll describe the products myself" },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    const prev = process.env.OPEN_ROUTER_API_KEY
    process.env.OPEN_ROUTER_API_KEY = 'sk-or-v1-test-key-for-followups-ai-generate'
    try {
      const generated = await generateContextualFollowUps({
        history: [{ role: 'user', content: 'I want to launch an online store for headphones' }],
        assistantMessage: 'Finish account setup. What will your store sell?',
        flags: { isGuest: true },
        fetchImpl,
      })
      assert.ok(generated)
      assert.equal(generated.items.length, 3)
      assert.ok(generated.items.some((i) => /headphone/i.test(i.label)))
      assert.equal(looksLikeCannedCatalogChips(generated.items), false)
      assert.equal(looksLikeCannedAppTypeCatalog(generated.items), false)
    } finally {
      if (prev === undefined) delete process.env.OPEN_ROUTER_API_KEY
      else process.env.OPEN_ROUTER_API_KEY = prev
    }
  })

  it('drops SaaS/blog types when the chat is a store ask', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: 'What kind of web app is this?',
                  items: [
                    { label: 'SaaS / web app', message: 'This is a SaaS app' },
                    { label: 'Landing / marketing site', message: 'This is a landing website' },
                    { label: 'Ecommerce / store', message: 'This is an online store' },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    const prev = process.env.OPEN_ROUTER_API_KEY
    process.env.OPEN_ROUTER_API_KEY = 'sk-or-v1-test-key-for-followups-ai-generate'
    try {
      const generated = await generateContextualFollowUps({
        history: [{ role: 'user', content: 'Build me an online shop' }],
        assistantMessage: 'What kind of web app is this?',
        flags: { isGuest: true },
        fetchImpl,
      })
      assert.equal(generated, null)
    } finally {
      if (prev === undefined) delete process.env.OPEN_ROUTER_API_KEY
      else process.env.OPEN_ROUTER_API_KEY = prev
    }
  })
})
