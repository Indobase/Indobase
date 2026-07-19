/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DeployButton } from './DeployButton';

vi.mock('~/lib/deploy/runOneClickDeploy', () => ({
  runOneClickDeploy: vi.fn(),
}));

describe('DeployButton', () => {
  it('mounts without reference errors', () => {
    expect(() => render(<DeployButton />)).not.toThrow();
  });

  it('shows the primary deploy label', () => {
    render(<DeployButton />);
    expect(screen.getByText(/Publish|Deploy/)).toBeTruthy();
  });

  it('lists Indobase publish options and omits third-party deploys', async () => {
    render(<DeployButton />);

    // Radix triggers open on pointer/keyboard events, not synthetic clicks, in jsdom.
    const trigger = screen.getByRole('button', { name: 'More deploy options' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(await screen.findByText('Publish to Indobase subdomain')).toBeTruthy();
    expect(screen.queryByText(/Vercel/i)).toBeNull();
    expect(screen.queryByText(/Netlify/i)).toBeNull();
    expect(screen.queryByText(/Deploy to GitHub/i)).toBeNull();
    expect(screen.queryByText(/GitLab/i)).toBeNull();
  });
});
