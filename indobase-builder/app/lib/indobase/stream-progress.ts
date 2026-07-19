type StreamMessageLike = {
  content?: string | null;
};

/**
 * Progress marker for the stream-stall watchdog. Message growth and REAL data-stream annotations
 * (planner/summary progress, usage, ...) count as progress; server keepalive pings do NOT — they
 * fire every 20s forever, so counting them meant a dead model stream kept the composer on
 * "Agent is working…" indefinitely and the watchdog (and its repair path) never ran.
 */
export function computeStreamProgressMarker(messages: StreamMessageLike[], streamData: unknown[] | undefined): string {
  const meaningfulData = (streamData ?? []).filter(
    (item) => !(typeof item === 'object' && item !== null && (item as { type?: string }).type === 'keepalive'),
  );
  const lastMessageLength = messages[messages.length - 1]?.content?.length ?? 0;

  return `${messages.length}:${lastMessageLength}:${meaningfulData.length}`;
}
