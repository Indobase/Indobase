import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { clearProductionLaunchJobsForTests } from '../production-launch/index.ts'
import { ECOMMERCE_CERT_CORPUS } from './ecommerce-cert-corpus.ts'
import {
  formatEcommerceCertReport,
  runEcommerceCertification,
} from './ecommerce-certification.ts'

describe('Ecommerce production certification v1', () => {
  beforeEach(() => {
    process.env.INDOBASE_PRODUCTION_JOB_DIR = mkdtempSync(path.join(tmpdir(), 'ecom-cert-'))
    clearProductionLaunchJobsForTests()
  })

  it('corpus has 20 distinct store prompts', () => {
    assert.equal(ECOMMERCE_CERT_CORPUS.length, 20)
    const ids = new Set(ECOMMERCE_CERT_CORPUS.map((s) => s.id))
    const prompts = new Set(ECOMMERCE_CERT_CORPUS.map((s) => s.prompt))
    assert.equal(ids.size, 20)
    assert.equal(prompts.size, 20)
  })

  it('certifies all 20 stores on the v1 required loop', async () => {
    const report = await runEcommerceCertification()
    if (report.failed) {
      console.error(formatEcommerceCertReport(report))
    }
    assert.equal(report.stores, 20)
    assert.equal(report.certified, 20, formatEcommerceCertReport(report))
    assert.equal(report.failed, 0)
    for (const row of report.results) {
      assert.equal(row.certified, true, row.store.id)
      assert.ok(row.gaps.some((g) => g.id === 'failed_payment_recovery_ui'))
      assert.equal(row.gaps.some((g) => g.id === 'customer_signup'), false)
      assert.ok(row.checks.some((c) => c.id === 'search_filter' && c.status === 'pass'))
      assert.ok(row.checks.some((c) => c.id === 'product_detail' && c.status === 'pass'))
      assert.ok(row.checks.some((c) => c.id === 'job_live' && c.status === 'pass'))
    }
  })
})
