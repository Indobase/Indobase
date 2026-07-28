/** SessionStorage + custom-event contracts between Design home and editor. */

export const PENDING_UPLOAD_KEY = "indobase-design-pending-upload";
export const OPEN_PANEL_KEY = "indobase-design-open-panel";
export const OPEN_PANEL_EVENT = "indobase-design-open-panel";
export const SECTION_EVENT = "indobase-design-section";

/** Panel hint stored by home before navigating into the editor. */
export type OpenPanelId = string;

export type PendingUpload = {
  url: string;
  name: string;
};

export function setPendingUpload(payload: PendingUpload): void {
  try {
    sessionStorage.setItem(PENDING_UPLOAD_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function peekPendingUpload(): PendingUpload | null {
  try {
    const raw = sessionStorage.getItem(PENDING_UPLOAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingUpload;
    if (!parsed?.url || typeof parsed.url !== "string") return null;
    return { url: parsed.url, name: typeof parsed.name === "string" ? parsed.name : "Upload" };
  } catch {
    return null;
  }
}

export function clearPendingUpload(): void {
  try {
    sessionStorage.removeItem(PENDING_UPLOAD_KEY);
  } catch {
    /* ignore */
  }
}

export function setOpenPanel(panel: OpenPanelId): void {
  try {
    sessionStorage.setItem(OPEN_PANEL_KEY, panel);
  } catch {
    /* ignore */
  }
}

/** Read and clear a one-shot open-panel hint (consumed by left sidebar on mount). */
export function takeOpenPanelHint(): string | null {
  try {
    const v = sessionStorage.getItem(OPEN_PANEL_KEY);
    sessionStorage.removeItem(OPEN_PANEL_KEY);
    const trimmed = v?.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

/** Notify an already-mounted editor to open a panel. */
export function dispatchOpenPanel(panel: OpenPanelId): void {
  setOpenPanel(panel);
  try {
    window.dispatchEvent(new CustomEvent(OPEN_PANEL_EVENT, { detail: { panel } }));
  } catch {
    /* ignore */
  }
}
