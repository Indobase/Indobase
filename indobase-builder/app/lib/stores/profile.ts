import { atom } from 'nanostores';

interface Profile {
  username: string;
  bio: string;
  avatar: string;
}

const emptyProfile: Profile = {
  username: '',
  bio: '',
  avatar: '',
};

// Keep SSR and the first client render identical; hydrate from localStorage after mount.
export const profileStore = atom<Profile>(emptyProfile);

export const updateProfile = (updates: Partial<Profile>) => {
  profileStore.set({ ...profileStore.get(), ...updates });

  // Persist to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem('bolt_profile', JSON.stringify(profileStore.get()));
  }
};

/**
 * Map Studio-authenticated identity onto the Builder profile UI.
 * Without this, sidebar/header keep showing "Guest User" after /launch handoff.
 */
export function syncProfileFromStudioIdentity(identity: { email?: string | null; sub?: string | null }) {
  const email = identity.email?.trim();

  if (!email) {
    return;
  }

  const current = profileStore.get();

  if (current.username === email) {
    return;
  }

  updateProfile({
    username: email,
    bio: current.bio.trim() || email,
  });
}
