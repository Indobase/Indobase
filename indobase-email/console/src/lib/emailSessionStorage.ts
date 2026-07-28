/** Last Indobase project ref used for a successful Email SSO handoff. */
export const EMAIL_LAST_PROJECT_REF_KEY = 'email_last_project_ref'

export function readEmailLastProjectRef(): string | null {
  try {
    const v = localStorage.getItem(EMAIL_LAST_PROJECT_REF_KEY)
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

export function writeEmailLastProjectRef(projectRef: string | null | undefined): void {
  const ref = typeof projectRef === 'string' ? projectRef.trim() : ''
  if (!ref) return
  try {
    localStorage.setItem(EMAIL_LAST_PROJECT_REF_KEY, ref)
  } catch {
    // ignore quota / private mode
  }
}
