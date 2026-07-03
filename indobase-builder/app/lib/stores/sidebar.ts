import { atom } from 'nanostores';

/**
 * Shared open/closed state for the chat-history sidebar (Menu.client).
 * Lets the header button (and anything else) open/close it, instead of the
 * hidden hover-at-the-left-edge trigger being the only way in.
 */
export const sidebarOpen = atom<boolean>(false);

export function setSidebarOpen(open: boolean) {
  sidebarOpen.set(open);
}

export function toggleSidebar() {
  sidebarOpen.set(!sidebarOpen.get());
}
