/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DeployButton } from './DeployButton';

vi.mock('~/components/deploy/VercelDeploy.client', () => ({
  useVercelDeploy: () => ({
    isDeploying: false,
    handleVercelDeploy: vi.fn(),
    isConnected: true,
  }),
}));

vi.mock('~/components/deploy/NetlifyDeploy.client', () => ({
  useNetlifyDeploy: () => ({
    isDeploying: false,
    handleNetlifyDeploy: vi.fn(),
    isConnected: false,
  }),
}));

vi.mock('~/components/deploy/GitHubDeploy.client', () => ({
  useGitHubDeploy: () => ({
    isDeploying: false,
    handleGitHubDeploy: vi.fn(),
  }),
}));

vi.mock('~/components/deploy/GitLabDeploy.client', () => ({
  useGitLabDeploy: () => ({
    isDeploying: false,
    handleGitLabDeploy: vi.fn(),
  }),
}));

describe('DeployButton', () => {
  it('mounts without reference errors', () => {
    expect(() => render(<DeployButton />)).not.toThrow();
  });

  it('shows the primary deploy label', () => {
    render(<DeployButton />);
    expect(screen.getByText(/Publish|Deploy/)).toBeTruthy();
  });

  it('lists Vercel and Netlify in the deploy menu', async () => {
    render(<DeployButton />);

    // Radix triggers open on pointer/keyboard events, not synthetic clicks, in jsdom.
    const trigger = screen.getByRole('button', { name: 'More deploy options' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(await screen.findByText('Deploy to Vercel')).toBeTruthy();
    expect(await screen.findByText('No Netlify Account Connected')).toBeTruthy();
  });
});
