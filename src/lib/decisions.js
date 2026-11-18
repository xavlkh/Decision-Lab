export const MODEL = 'gemini-decision-1'
export const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/decisions'
export const INPUT_COST_PER_TOKEN = 0.1 / 1_000_000
export const CONFIDENCE_LABELS = ['0.5-0.6', '0.6-0.7', '0.7-0.8', '0.8-0.9', '0.9-1.0']

export class DecisionError extends Error {
  constructor(message, { code = 'unknown', status = 0, details = null } = {}) {
    super(message)
    this.name = 'DecisionError'
    this.code = code
    this.status = status
    this.details = details
  }
}

const SAFETY_CODES = new Set([
  'safety',
  'prohibited_content',
  'blocklist',
  'image_safety',
  'content_blocked',
])

function apiErrorCode(error) {
  if (typeof error?.code === 'string') return error.code
  if (typeof error?.status === 'string') return error.status.toLowerCase()
  return 'http'
}

function friendlyMessage(message, { status, code }) {
  if (status === 401 || status === 403 || code === 'permission_denied' || code === 'unauthenticated') {
    return 'The API key was rejected. Use a Gemini API key from Google AI Studio that has access to the Decisions API.'
  }

  if (status === 404) {
    return 'The Decisions API was not found for this key. Confirm the key is from https://aistudio.google.com/api-keys.'
  }

  if (status === 429 || code === 'resource_exhausted') {
    return 'Rate limit reached. Wait a moment, then run the request again.'
  }

  if (status === 400 && SAFETY_CODES.has(code)) {
    return `The request was blocked by safety filters (${code}). Edit the input and retry.`
  }

  if (status === 400 && /api key (not valid|invalid|expired)/i.test(message ?? '')) {
    return 'The API key is not valid. Check or create a key at https://aistudio.google.com/api-keys, then test again.'
  }

  if (status === 400 && code === 'invalid_argument') {
    return message || 'The request was rejected as invalid. Check the question keys, criteria, and input.'
  }

  return message || 'The Decisions API request failed.'
}

function normalizeInput(input) {
  if (typeof input === 'string') return input
  if (Array.isArray(input)) return input
  return String(input ?? '')
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`

  const units = ['KB', 'MB', 'GB']
  let size = value / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`
}

export function summarizeRequest(payload) {
  if (!Array.isArray(payload?.input)) return payload

  return {
    ...payload,
    input: payload.input.map((block) => {
      if (!block || typeof block !== 'object' || !block.data) return block
      const bytes = Math.round((String(block.data).length * 3) / 4)
      return { ...block, data: `[base64 omitted: ${formatBytes(bytes)}]` }
    }),
  }
}

/**
 * Sends one Decisions API request.
 * Resolves with { request, response, answers, usage, elapsedMs }.
 */
export async function createDecision({ apiKey, input, questions, signal }) {
  if (!apiKey) {
    throw new DecisionError(
      'No Gemini API key. Paste one in the key bar or set VITE_GEMINI_API_KEY in .env.',
      { code: 'missing_key' },
    )
  }

  const normalizedInput = normalizeInput(input)
  const inputIsEmpty =
    typeof normalizedInput === 'string'
      ? !normalizedInput.trim()
      : normalizedInput.length === 0

  if (inputIsEmpty) {
    throw new DecisionError('Add some input for the model to decide on.', { code: 'missing_input' })
  }

  if (!questions || Object.keys(questions).length === 0) {
    throw new DecisionError('Add at least one question.', { code: 'missing_questions' })
  }

  const payload = { model: MODEL, input: normalizedInput, questions }
  const started = performance.now()
  let response

  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new DecisionError(
      'Could not reach generativelanguage.googleapis.com. Check your connection, then retry.',
      { code: 'network', details: String(error?.message ?? error) },
    )
  }

  const elapsedMs = Math.round(performance.now() - started)
  const text = await response.text()
  let body = {}

  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      throw new DecisionError(`The API returned a non-JSON response (HTTP ${response.status}).`, {
        code: 'invalid_response',
        status: response.status,
        details: text.slice(0, 2000),
      })
    }
  }

  if (!response.ok) {
    const detail = body?.error ?? null
    const code = apiErrorCode(detail)
    throw new DecisionError(friendlyMessage(detail?.message, { status: response.status, code }), {
      code,
      status: response.status,
      details: body,
    })
  }

  if (!body?.answers || typeof body.answers !== 'object') {
    throw new DecisionError('The API response did not include any answers.', {
      code: 'invalid_response',
      status: response.status,
      details: body,
    })
  }

  return {
    request: summarizeRequest(payload),
    response: body,
    answers: body.answers,
    usage: body.usage ?? {},
    elapsedMs,
  }
}

export function toApiQuestion(question) {
  const instructions = String(question.instructions ?? '').trim()

  if (question.type === 'noul') {
    const criteria = {}
    const trueDescription = String(question.criteria?.true_description ?? '').trim()
    const falseDescription = String(question.criteria?.false_description ?? '').trim()
    if (trueDescription) criteria.true_description = trueDescription
    if (falseDescription) criteria.false_description = falseDescription

    return {
      type: 'noul',
      instructions,
      ...(Object.keys(criteria).length > 0 ? { criteria } : {}),
    }
  }

  if (question.type === 'choice') {
    const criteria = {}
    for (const [key, value] of Object.entries(question.criteria ?? {})) {
      criteria[String(key).trim()] = String(value ?? '').trim()
    }
    return { type: 'choice', instructions, criteria }
  }

  return {
    type: 'score',
    instructions,
    criteria: (question.criteria ?? []).map((level) => String(level).trim()),
  }
}

export function validateQuestions(questions) {
  const entries = Object.entries(questions ?? {})
  if (entries.length === 0) return 'Add at least one question.'

  for (const [id, question] of entries) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      return `Question key "${id}" must be 1-64 characters using letters, numbers, _ or -.`
    }

    if (!String(question?.instructions ?? '').trim()) {
      return `Question "${id}" needs instructions.`
    }

    if (question.type === 'choice') {
      const keys = Object.keys(question.criteria ?? {})
      if (keys.length < 2) return `Choice question "${id}" needs at least two options.`
      if (keys.some((key) => !key)) return `Choice question "${id}" has an empty option key.`
      if (new Set(keys).size !== keys.length) return `Choice question "${id}" has duplicate option keys.`
    }

    if (question.type === 'score') {
      const levels = question.criteria ?? []
      if (levels.length < 2) return `Score question "${id}" needs at least two levels.`
      if (levels.some((level) => !String(level).trim())) {
        return `Score question "${id}" has an empty level.`
      }
    }
  }

  return null
}

export function confidenceOf(answer) {
  if (typeof answer?.confidence === 'number') return answer.confidence
  if (answer?.type === 'noul' && typeof answer.noul === 'number') {
    return Math.max(answer.noul, 1 - answer.noul)
  }
  return 0
}

export function topLevel(answer) {
  const entries = Object.entries(answer?.probabilities ?? {})
  if (entries.length === 0) return null

  const [index, probability] = entries.reduce((best, entry) =>
    entry[1] > best[1] ? entry : best,
  )

  return {
    index: Number(index),
    level: answer?.legend?.[index] ?? null,
    probability,
  }
}

export function estimateCost(usage) {
  return (usage?.total_input_tokens ?? 0) * INPUT_COST_PER_TOKEN
}

export function formatUsd(value) {
  if (!value) return '$0.000000'
  if (value < 0.01) return `$${value.toFixed(6)}`
  return `$${value.toFixed(4)}`
}

export function formatPct(value, digits = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatMs(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function formatTokens(tokens) {
  if (!tokens) return '0'
  return new Intl.NumberFormat('en-US').format(tokens)
}

export function confidenceTone(confidence) {
  if (confidence >= 0.8) return 'text-emerald-600 dark:text-emerald-400'
  if (confidence >= 0.6) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

export function confidenceBarTone(confidence) {
  if (confidence >= 0.8) return 'bg-emerald-500'
  if (confidence >= 0.6) return 'bg-amber-500'
  return 'bg-rose-500'
}
