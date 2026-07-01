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

  it('lists Vercel and Netlify in the deploy menu', () => {
    render(<DeployButton />);

    fireEvent.click(screen.getByRole('button', { name: 'More deploy options' }));

    expect(screen.getByText('Deploy to Vercel')).toBeTruthy();
    expect(screen.getByText('No Netlify Account Connected')).toBeTruthy();
  });
});
