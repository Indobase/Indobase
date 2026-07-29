import { randomUUID } from 'crypto'

export class SecretDecryptionError extends Error {
  readonly correlationId: string

  constructor(correlationId: string = randomUUID()) {
    super('Failed to decrypt stored secret')
    this.name = 'SecretDecryptionError'
    this.correlationId = correlationId
  }
}

export function isSecretDecryptionError(error: unknown): error is SecretDecryptionError {
  return error instanceof SecretDecryptionError
}

/** Client-safe message; never mention env var names for crypto keys. */
export function secretDecryptionClientMessage(correlationId: string) {
  return `Unable to read encrypted project data. Reference ID: ${correlationId}`
}
