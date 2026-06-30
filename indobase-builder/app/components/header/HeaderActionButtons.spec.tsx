/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HeaderActionButtons } from './HeaderActionButtons.client';
import { workbenchStore } from '~/lib/stores/workbench';

describe('HeaderActionButtons', () => {
  it('renders when chat has started without throwing', () => {
    workbenchStore.files.set({});

    expect(() => render(<HeaderActionButtons chatStarted />)).not.toThrow();
  });

  it('mounts deploy UI when files exist', async () => {
    workbenchStore.files.set({
      '/home/project/index.html': { type: 'file', content: '<html></html>', isBinary: false },
    });

    const { findByText } = render(<HeaderActionButtons chatStarted />);
    expect(await findByText('Publish')).toBeTruthy();
  });
});
