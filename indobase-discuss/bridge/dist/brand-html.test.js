import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { brandDiscussHtml, DISCUSS_BRAND_NAME, shouldBrandDiscussResponse } from './brand-html.js';
describe('brandDiscussHtml', () => {
    it('rewrites title and visible Gameplan text', () => {
        const html = `<!doctype html><html><head><title>Gameplan</title></head><body><h1>Welcome to Gameplan</h1><script>var x="Gameplan"</script></body></html>`;
        const out = brandDiscussHtml(html);
        assert.match(out, new RegExp(`<title>${DISCUSS_BRAND_NAME}</title>`));
        assert.match(out, /Welcome to Discuss/);
        assert.match(out, /var x="Gameplan"/);
        assert.match(out, /indobase-favicon\.svg/);
    });
    it('only brands html content types', () => {
        assert.equal(shouldBrandDiscussResponse('text/html; charset=utf-8'), true);
        assert.equal(shouldBrandDiscussResponse('application/javascript'), false);
    });
});
