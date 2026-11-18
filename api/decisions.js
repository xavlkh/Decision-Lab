const GOOGLE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/decisions'
const ALLOWED_MODEL = 'gemini-decision-1'
const MAX_BODY_BYTES = 4_500_000

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body !== undefined) {
    return typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  }

  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  res.statusCode = status
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

function jsonError(res, status, code, message) {
  send(res, status, JSON.stringify({ error: { code, message } }))
}

function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true

  try {
    const forwardedHost = String(req.headers['x-forwarded-host'] ?? '')
      .split(',')[0]
      .trim()
    const expectedHost = forwardedHost || req.headers.host
    return new URL(origin).host === expectedHost
  } catch {
    return false
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Allow', 'POST, OPTIONS')
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS')
    jsonError(res, 405, 'method_not_allowed', 'Use POST.')
    return
  }

  if (!sameOrigin(req)) {
    jsonError(res, 403, 'forbidden_origin', 'Cross-origin requests are not allowed.')
    return
  }

  if (!process.env.GEMINI_API_KEY) {
    jsonError(
      res,
      500,
      'missing_server_key',
      'The server has no Gemini key. Set GEMINI_API_KEY in Vercel and redeploy.',
    )
    return
  }

  let raw
  try {
    raw = await readBody(req)
  } catch {
    jsonError(res, 400, 'invalid_body', 'Could not read the request body.')
    return
  }

  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    jsonError(
      res,
      413,
      'payload_too_large',
      'The request is over the 4.5 MB proxy limit. Paste your own key in the key bar for large files.',
    )
    return
  }

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    jsonError(res, 400, 'invalid_json', 'The request body is not valid JSON.')
    return
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    jsonError(res, 400, 'invalid_payload', 'The request body must be a JSON object.')
    return
  }

  if (payload.model !== ALLOWED_MODEL) {
    jsonError(res, 400, 'invalid_model', `Only ${ALLOWED_MODEL} is available through this proxy.`)
    return
  }

  if (typeof payload.input !== 'string' && !Array.isArray(payload.input)) {
    jsonError(res, 400, 'invalid_input', 'The input must be a string or an array of content blocks.')
    return
  }

  if (
    !payload.questions ||
    typeof payload.questions !== 'object' ||
    Array.isArray(payload.questions) ||
    Object.keys(payload.questions).length === 0
  ) {
    jsonError(res, 400, 'invalid_questions', 'At least one question is required.')
    return
  }

  let upstream
  try {
    upstream = await fetch(GOOGLE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        model: payload.model,
        input: payload.input,
        questions: payload.questions,
      }),
    })
  } catch {
    jsonError(res, 502, 'proxy_error', 'Could not reach the Decisions API.')
    return
  }

  const text = await upstream.text()
  send(
    res,
    upstream.status,
    text,
    upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
  )
}
