/**
 * @indobase/platform — Indobase OS kernel
 *
 * Seven contracts: Identity · Workspace · Documents · Commands · Events · Capabilities · Execution
 * See docs/PLATFORM.md. No product business logic.
 */

export * from './ids'

export * from './identity'
export * from './commands'
export * from './events'
export * from './workspace'
export * from './documents'
export * from './execution'
export * from './business'

export * from './contracts/runtime'
export * from './contracts/capability-contract'
export * from './contracts/workspace'
export * from './contracts/design'

export * from './capabilities/registry'
export * from './capabilities/commands'
export * from './capabilities/resolver'
export * from './capabilities/generation-context'
export * from './capabilities/register-gen1'
export { authCapability } from './capabilities/definitions/auth'

export * from './adapters/registry'

export { Platform, createPlatform, type PlatformApi, type CreatePlatformOptions } from './platform'
