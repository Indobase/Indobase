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

  it('shows overflow actions when files exist (Publish lives on workbench)', async () => {
    workbenchStore.files.set({
      '/home/project/index.html': { type: 'file', content: '<html></html>', isBinary: false },
    });

    const { findByLabelText } = render(<HeaderActionButtons chatStarted />);
    expect(await findByLabelText('More actions')).toBeTruthy();
  });
});
