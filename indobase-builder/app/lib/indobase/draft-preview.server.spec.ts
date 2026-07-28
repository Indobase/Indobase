import { describe, expect, it } from 'vitest';

import {
  draftPreviewPublicUrl,
  getDraftPreview,
  resolveDraftPreviewFile,
  storeDraftPreview,
} from './draft-preview.server';

describe('draft-preview.server', () => {
  it('stores and serves index.html for a draft id', () => {
    const draft = storeDraftPreview({
      'index.html': '<html><head></head><body><script src="/assets/app.js"></script>Hello</body></html>',
      'assets/app.js': 'console.log(1)',
    });

    expect(getDraftPreview(draft.id)?.files['index.html']).toContain(
      `src="/draft-preview/${draft.id}/assets/app.js"`,
    );
    expect(draftPreviewPublicUrl(draft.id, 'https://builder.indobase.in')).toBe(
      `https://builder.indobase.in/draft-preview/${draft.id}/`,
    );

    expect(resolveDraftPreviewFile(draft.id, '')?.content).toContain('Hello');
    expect(resolveDraftPreviewFile(draft.id, 'assets/app.js')).toEqual({
      content: 'console.log(1)',
      contentType: 'text/javascript; charset=utf-8',
    });
  });

  it('rejects drafts without index.html', () => {
    expect(() => storeDraftPreview({ 'app.js': 'x' })).toThrow(/index\.html/);
  });
});
