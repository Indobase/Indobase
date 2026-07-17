import { profileStore } from '~/lib/stores/profile';
import { DEFAULT_THEME, kTheme, themeStore, type Theme } from '~/lib/stores/theme';

/** Apply localStorage-backed prefs after mount so SSR and first client render match. */
export function hydrateClientPrefsFromStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const persistedTheme = localStorage.getItem(kTheme) as Theme | undefined;

    if (persistedTheme === 'dark' || persistedTheme === 'light') {
      themeStore.set(persistedTheme);
      document.documentElement.setAttribute('data-theme', persistedTheme);
    }
  } catch {
    themeStore.set(DEFAULT_THEME);
  }

  try {
    const storedProfile = localStorage.getItem('bolt_profile');

    if (storedProfile) {
      profileStore.set(JSON.parse(storedProfile));
    }
  } catch {
    // ignore corrupt profile blob
  }
}
