/** Re-export — events live in ./events/ */
export {
  createEventBus,
  createNoopEventBus,
  toPlatformEvent,
  type PlatformEvent,
  type PlatformEventBus,
  type PlatformEventHandler,
  type WorkspaceDomainEvent,
} from './events/index'
