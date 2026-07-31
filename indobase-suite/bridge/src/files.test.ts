import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createFile,
  listFiles,
  mintFileAccessToken,
  readFileBytes,
  saveFileBytes,
  verifyFileAccessToken,
} from './files.js'

test('file store create/list/save round-trip', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ib-ws-'))
  process.env.WORKSPACE_DATA_DIR = dir
  try {
    const meta = await createFile({
      projectRef: 'abc123',
      name: 'Notes',
      kind: 'doc',
      createdBy: 'a@indobase.in',
    })
    assert.equal(meta.ext, 'docx')
    assert.match(meta.name, /\.docx$/)
    const listed = await listFiles('abc123', 'doc')
    assert.equal(listed.length, 1)
    const bytes = await readFileBytes('abc123', meta.id)
    assert.ok(bytes && bytes.length > 0)
    // Blank Word template must be a real OOXML package — a 3-entry stub causes
    // DocumentServer to surface "Download failed" after the editor chrome loads.
    assert.equal(bytes![0], 0x50)
    assert.equal(bytes![1], 0x4b)
    assert.ok(bytes!.length > 1500)
    const asText = bytes!.toString('binary')
    for (const part of [
      'word/document.xml',
      'word/_rels/document.xml.rels',
      'word/styles.xml',
      'docProps/core.xml',
    ]) {
      assert.ok(asText.includes(part), `missing OOXML part ${part}`)
    }
    await saveFileBytes('abc123', meta.id, Buffer.from('updated'))
    const again = await readFileBytes('abc123', meta.id)
    assert.equal(again?.toString(), 'updated')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('file access token verifies', () => {
  const secret = 'x'.repeat(32)
  const token = mintFileAccessToken(secret, 'proj', 'file1', 60)
  const claims = verifyFileAccessToken(secret, token)
  assert.deepEqual(claims, { projectRef: 'proj', fileId: 'file1' })
  assert.equal(verifyFileAccessToken('y'.repeat(32), token), null)
})
