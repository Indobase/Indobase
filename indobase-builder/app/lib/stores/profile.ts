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
