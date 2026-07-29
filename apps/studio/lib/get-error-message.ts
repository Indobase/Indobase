/**
 * Extracts a human-readable error message from various error types.
 */
export function getErrorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    if ('message' in error) {
      const message = (error as { message?: unknown }).message
      if (typeof message === 'string' && message.length > 0) return message
      if (message !== undefined && message !== null) {
        try {
          return JSON.stringify(message)
        } catch {
          return String(message)
        }
      }
    }

    if ('error' in error && typeof (error as { error?: unknown }).error === 'string') {
      return (error as { error: string }).error
    }

    if ('error_description' in error && typeof (error as { error_description?: unknown }).error_description === 'string') {
      return (error as { error_description: string }).error_description
    }

    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}
