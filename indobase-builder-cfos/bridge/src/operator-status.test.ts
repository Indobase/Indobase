import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  OPERATOR_STATUS,
  isForbiddenOperatorStatus,
  operatorStatusForTool,
} from './operator-status.ts'

describe('operator status verbs', () => {
  it('never returns Working', () => {
    assert.equal(operatorStatusForTool('launchProductionApp'), OPERATOR_STATUS.launching)
    assert.equal(operatorStatusForTool('launchBusiness'), OPERATOR_STATUS.creating)
    assert.equal(operatorStatusForTool('connectGateway'), OPERATOR_STATUS.updating)
    assert.equal(operatorStatusForTool('authStart'), OPERATOR_STATUS.checking)
    assert.equal(operatorStatusForTool('guidedBackend'), OPERATOR_STATUS.creating)
    assert.equal(operatorStatusForTool('ensureDatabase'), OPERATOR_STATUS.creating)
    assert.equal(operatorStatusForTool('unknownTool'), OPERATOR_STATUS.creating)
    for (const name of [
      'launchProductionApp',
      'guidedBackend',
      'ensureLogin',
      '',
      'webFetch',
    ]) {
      assert.equal(isForbiddenOperatorStatus(operatorStatusForTool(name)), false)
    }
  })

  it('flags Working as forbidden customer copy', () => {
    assert.equal(isForbiddenOperatorStatus('Working'), true)
    assert.equal(isForbiddenOperatorStatus('Creating'), false)
  })
})
