/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { profileStore, syncProfileFromStudioIdentity, updateProfile } from './profile';

describe('syncProfileFromStudioIdentity', () => {
  beforeEach(() => {
    localStorage.clear();
    profileStore.set({ username: '', bio: '', avatar: '' });
  });

  it('sets username from Studio email so the UI is not Guest User', () => {
    syncProfileFromStudioIdentity({ email: 'ros@indobase.in', sub: 'user-1' });

    expect(profileStore.get().username).toBe('ros@indobase.in');
    expect(JSON.parse(localStorage.getItem('bolt_profile') || '{}').username).toBe('ros@indobase.in');
  });

  it('no-ops when email is missing', () => {
    updateProfile({ username: 'Guest User' });
    syncProfileFromStudioIdentity({ email: '', sub: 'user-1' });
    expect(profileStore.get().username).toBe('Guest User');
  });
});
