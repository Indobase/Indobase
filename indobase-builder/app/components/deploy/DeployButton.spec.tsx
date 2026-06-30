/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DeployButton } from './DeployButton';

describe('DeployButton', () => {
  it('mounts without reference errors', () => {
    expect(() => render(<DeployButton />)).not.toThrow();
  });

  it('shows the primary deploy label', () => {
    const { getByText } = render(<DeployButton />);
    expect(getByText(/Publish|Deploy/)).toBeTruthy();
  });
});
