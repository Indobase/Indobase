export type SpamRule = {
  name: string
  desc: string
  score: number
}

export type ValidateEmailSpamInput = {
  subject: string
  content: string
}

export type ValidateEmailSpamResult = {
  rules: SpamRule[]
}

const URL_REGEX = /https?:\/\/[^\s<>"')]+/gi

function countUrls(text: string): number {
  return (text.match(URL_REGEX) ?? []).length
}

function isMostlyUppercase(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, '')
  if (letters.length < 6) return false
  const upper = letters.replace(/[^A-Z]/g, '').length
  return upper / letters.length >= 0.8
}

function countExclamations(text: string): number {
  return (text.match(/!/g) ?? []).length
}

/**
 * Lightweight spam checks for auth email templates when SpamAssassin is not available.
 * Scores mirror common SpamAssassin rule names so the Studio UI stays consistent.
 */
export function validateEmailSpamHeuristics({
  subject,
  content,
}: ValidateEmailSpamInput): ValidateEmailSpamResult {
  const rules: SpamRule[] = []
  const trimmedSubject = subject.trim()
  const trimmedContent = content.trim()
  const combined = `${trimmedSubject}\n${trimmedContent}`

  if (!trimmedSubject) {
    rules.push({
      name: 'MISSING_SUBJECT',
      desc: 'The email subject is empty.',
      score: 2.5,
    })
  } else if (trimmedSubject.length < 3) {
    rules.push({
      name: 'SHORT_SUBJ',
      desc: 'The email subject is very short.',
      score: 1.2,
    })
  } else if (isMostlyUppercase(trimmedSubject)) {
    rules.push({
      name: 'SUBJ_ALL_CAPS',
      desc: 'The subject line is mostly uppercase, which can trigger spam filters.',
      score: 1.8,
    })
  }

  if (!trimmedContent) {
    rules.push({
      name: 'EMPTY_BODY',
      desc: 'The email body is empty.',
      score: 2.5,
    })
  }

  const exclamations = countExclamations(combined)
  if (exclamations >= 3) {
    rules.push({
      name: 'EXCESSIVE_EXCLAMATION',
      desc: 'The message contains multiple exclamation marks.',
      score: 1.5,
    })
  }

  const urlCount = countUrls(combined)
  if (urlCount >= 6) {
    rules.push({
      name: 'URI_COUNT_HIGH',
      desc: 'The message contains many links, which can trigger spam filters.',
      score: 2.0,
    })
  } else if (urlCount >= 3) {
    rules.push({
      name: 'URI_COUNT',
      desc: 'The message contains several links.',
      score: 1.0,
    })
  }

  if (/<img\b/i.test(trimmedContent) && trimmedContent.replace(/<[^>]+>/g, '').trim().length < 40) {
    rules.push({
      name: 'HTML_IMAGE_ONLY_04',
      desc: 'The message is mostly an image with very little text.',
      score: 2.0,
    })
  }

  if (/\b(viagra|cialis|casino|lottery|winner|click here now|act now)\b/i.test(combined)) {
    rules.push({
      name: 'SUSPICIOUS_KEYWORDS',
      desc: 'The message contains wording commonly associated with spam.',
      score: 2.5,
    })
  }

  return { rules }
}

async function validateEmailSpamRemote(
  input: ValidateEmailSpamInput
): Promise<ValidateEmailSpamResult | null> {
  const url = process.env.SPAM_VALIDATION_URL?.trim()
  if (!url) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const body = (await res.json()) as { rules?: SpamRule[] }
    if (!Array.isArray(body.rules)) return null
    return {
      rules: body.rules
        .filter((r) => r && typeof r.name === 'string')
        .map((r) => ({
          name: String(r.name),
          desc: String(r.desc ?? ''),
          score: Number(r.score) || 0,
        })),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** Validate template subject/body; prefers SPAM_VALIDATION_URL, else local heuristics. */
export async function validateEmailSpam(
  input: ValidateEmailSpamInput
): Promise<ValidateEmailSpamResult> {
  const remote = await validateEmailSpamRemote(input)
  if (remote) return remote
  return validateEmailSpamHeuristics(input)
}
