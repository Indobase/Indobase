import { describe, expect, it } from 'vitest';
import { getAutoIndobaseMcpConfig } from './mcp';
import { isTemplateBootstrapFollowUp } from './chat-request';

describe('getAutoIndobaseMcpConfig', () => {
  it('points at Studio /api/mcp with project_ref', () => {
    const config = getAutoIndobaseMcpConfig({
      isConnected: true,
      hasSelectedProject: true,
      connectionSource: 'studio_handoff',
      indobase: {
        studioUrl: 'https://studio.indobase.in',
        projectRef: 'adralproject-uspulzkzew',
        mcpToken: 'test-token',
      },
    });

    expect(config?.mcpServers.indobase.url).toBe(
      'https://studio.indobase.in/api/mcp?project_ref=adralproject-uspulzkzew',
    );
  });
});

describe('isTemplateBootstrapFollowUp', () => {
  it('detects hidden template continuation user message', () => {
    expect(
      isTemplateBootstrapFollowUp([
        { id: '1', role: 'user', content: 'hello' },
        {
          id: '2',
          role: 'user',
          content: 'template import is done, and you can now use the imported files',
        },
      ]),
    ).toBe(true);
  });
});
