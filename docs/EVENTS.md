# Events

**Contract #5** · Package: `@indobase/platform` → `events/`

Everything reacts. Nothing polls for authoritative state.

## Envelope

```ts
type PlatformEvent<TType extends string = string, TPayload = unknown> = {
  type: TType
  payload: TPayload
  at: string
  projectRef?: ProjectRef
  workspaceId?: WorkspaceId
  commandId?: CommandId
  correlationId?: string
}
```

## Rules

1. Phase 1: in-process typed bus (no Kafka / NATS required).
2. Subscribers must tolerate at-least-once local delivery; keep handlers idempotent.
3. Domain events name facts (`WorkspaceCommitted`, `ExecutionFinished`) — not UI hints.
4. Product analytics (PostHog) is **not** this bus; adapters may mirror selected events.

## Builder today

`WorkspaceEventBus` is the first implementation. Platform provides the shared envelope + a default in-memory bus; Builder can keep a specialized union of workspace event types.
