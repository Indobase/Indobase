import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderDiscussWelcomeHtml } from './welcome.js';
describe('renderDiscussWelcomeHtml', () => {
    it('shows product landing with Studio CTAs (no blind bounce)', () => {
        const html = renderDiscussWelcomeHtml({ studioUrl: 'https://studio.indobase.in' });
        assert.match(html, /Indobase<\/span> Discuss/);
        assert.match(html, /Open Studio/);
        assert.match(html, /Resume sign-in/);
        assert.doesNotMatch(html, /Gameplan|Mattermost|Frappe/);
    });
});
