import { describe, expect, it } from 'vitest';
import { computeStreamProgressMarker } from './stream-progress';

describe('computeStreamProgressMarker', () => {
  it('changes when message text or real data annotations grow', () => {
    const initial = computeStreamProgressMarker([{ content: 'partial' }], []);
    const moreText = computeStreamProgressMarker([{ content: 'partial output' }], []);
    const moreData = computeStreamProgressMarker([{ content: 'partial output' }], [{ type: 'progress' }]);

    expect(moreText).not.toEqual(initial);
    expect(moreData).not.toEqual(moreText);
  });

  it('ignores keepalive pings so a dead stream trips the stall watchdog', () => {
    const messages = [{ content: 'stopped mid-file' }];
    const before = computeStreamProgressMarker(messages, [{ type: 'progress' }]);
    const afterKeepalives = computeStreamProgressMarker(messages, [
      { type: 'progress' },
      { type: 'keepalive', ts: 1 },
      { type: 'keepalive', ts: 2 },
      { type: 'keepalive', ts: 3 },
    ]);

    expect(afterKeepalives).toEqual(before);
  });

  it('handles empty transcripts and missing data', () => {
    expect(computeStreamProgressMarker([], undefined)).toEqual('0:0:0');
  });
});
