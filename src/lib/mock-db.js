import { getMockCustomers, normalizeKey } from './mock-db-store.js'

export const DB_QUESTION_KEYS = {
  exists: 'customer_exists',
  accurate: 'form_accurate',
  mismatch: 'mismatched_field',
}

export const FIELD_LABELS = {
  customer_id: 'Customer ID',
  name: 'Name',
  nric: 'NRIC/FIN',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  monthly_income: 'Monthly income',
}

const FIELD_ALIASES = {
  customer_id: ['customer id', 'customer_id', 'cust id', 'cust_id', 'client id', 'client_id'],
  name: ['name', 'full name', 'customer name', 'account holder', 'account holder name'],
  nric: ['nric', 'nric fin', 'nric/fin', 'fin', 'id number', 'identity number'],
  email: ['email', 'email address', 'e mail'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'contact number', 'contact no'],
  address: ['address', 'residential address', 'mailing address', 'home address'],
  monthly_income: [
    'monthly income',
    'monthly_income',
    'income',
    'gross monthly income',
    'salary',
    'monthly salary',
  ],
}

const ALIAS_TO_FIELD = Object.fromEntries(
  Object.entries(FIELD_ALIASES).flatMap(([field, aliases]) =>
    aliases.map((alias) => [alias, field]),
  ),
)

// customer_id is the lookup key, not an accuracy field.
const COMPARABLE_FIELDS = ['name', 'nric', 'email', 'phone', 'address', 'monthly_income']

const FIELD_OPTION_KEYS = {
  name: 'name',
  nric: 'nric',
  email: 'email',
  phone: 'phone',
  address: 'address',
  monthly_income: 'income',
}

export const MOCK_DB_QUESTIONS = [
  {
    key: DB_QUESTION_KEYS.exists,
    type: 'noul',
    instructions: 'Is the customer referenced by this form present in the mock customer database?',
    criteria: {
      true_description: 'The database context contains a matching customer record.',
      false_description: 'The database context shows no matching customer record.',
    },
  },
  {
    key: DB_QUESTION_KEYS.accurate,
    type: 'noul',
    instructions:
      'Do the form details match the authoritative customer record? Answer yes only if every field that appears in both sources matches.',
    criteria: {
      true_description: 'Every comparable form field matches the database record.',
      false_description:
        'At least one comparable form field differs, or the customer is absent from the database.',
    },
  },
  {
    key: DB_QUESTION_KEYS.mismatch,
    type: 'choice',
    instructions: 'Which form field is inconsistent with the customer record?',
    criteria: {
      none: 'No field differs from the database record.',
      name: 'The name differs.',
      nric: 'The NRIC/FIN differs.',
      email: 'The email address differs.',
      phone: 'The phone number differs.',
      address: 'The address differs.',
      income: 'The monthly income differs.',
      other: 'A custom field not listed above differs.',
      multiple: 'Two or more fields differ.',
    },
  },
]

function normalizeLabel(label) {
  return String(label ?? '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 /]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isScalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function parseJsonFields(text) {
  if (!text.startsWith('{')) return null

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const flat = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [childKey, childValue] of Object.entries(value)) {
        if (isScalar(childValue)) flat[childKey] = String(childValue)
      }
    } else if (isScalar(value)) {
      flat[key] = String(value)
    }
  }

  return mapFields(flat)
}

function parseLineFields(text) {
  const flat = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*"?([A-Za-z][A-Za-z0-9 _/.-]{0,48}?)"?\s*:\s*(.+?)\s*,?\s*$/)
    if (!match) continue
    let value = match[2].trim().replace(/^["']|["']$/g, '')
    if (!value) continue
    flat[match[1]] = value
  }
  return mapFields(flat)
}

function mapFields(raw) {
  const fields = {}
  for (const [label, value] of Object.entries(raw)) {
    if (value == null) continue
    const normalized = normalizeLabel(label)
    if (!normalized) continue
    const field = ALIAS_TO_FIELD[normalized] ?? normalizeKey(normalized)
    const text = String(value).trim()
    if (field && text) fields[field] = text
  }
  return fields
}

export function parseFormFields(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return {}
  return parseJsonFields(raw) ?? parseLineFields(raw)
}

function normalizeValue(field, value) {
  const string = String(value ?? '').trim()

  if (field === 'phone') {
    let digits = string.replace(/\D/g, '')
    if (digits.length > 8 && digits.startsWith('65')) digits = digits.slice(2)
    return digits
  }

  if (field === 'monthly_income') {
    const number = Number(string.replace(/[^0-9.]/g, ''))
    return Number.isFinite(number) ? number.toFixed(2) : string.toLowerCase()
  }

  if (field === 'customer_id' || field === 'nric') {
    return string.toUpperCase().replace(/\s+/g, '')
  }

  if (field === 'email') return string.toLowerCase()

  return string.toLowerCase().replace(/\s+/g, ' ')
}

function collectIdentifiers(text, fields) {
  const identifiers = {}

  if (fields.customer_id) identifiers.customer_id = fields.customer_id
  if (fields.nric) identifiers.nric = fields.nric
  if (fields.email) identifiers.email = fields.email

  const source = String(text ?? '')
  if (!identifiers.customer_id) {
    const match = source.match(/\bCUST-\d{4,}\b/i)
    if (match) identifiers.customer_id = match[0]
  }
  if (!identifiers.nric) {
    const match = source.match(/\b[STFGM]\d{7}[A-Z]\b/i)
    if (match) identifiers.nric = match[0]
  }
  if (!identifiers.email) {
    const match = source.match(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/)
    if (match) identifiers.email = match[0]
  }

  return identifiers
}

function findCustomer(identifiers) {
  const records = getMockCustomers()
  for (const field of ['customer_id', 'nric', 'email']) {
    const needle = identifiers[field]
    if (!needle) continue
    const customer = records.find(
      (record) => normalizeValue(field, record[field]) === normalizeValue(field, needle),
    )
    if (customer) return { customer, matchedBy: field }
  }
  return { customer: null, matchedBy: null }
}

export function compareFields(fields, customer) {
  if (!customer) return null

  const comparedFields = []
  const mismatches = []
  const fieldNames = new Set([
    ...COMPARABLE_FIELDS,
    ...Object.keys(fields),
    ...Object.keys(customer),
  ])

  for (const field of fieldNames) {
    if (field === 'customer_id') continue

    const formValue = fields[field]
    const dbValue = customer[field]
    if (formValue == null || String(formValue).trim() === '') continue
    if (dbValue == null || String(dbValue).trim() === '') continue

    comparedFields.push(field)
    if (normalizeValue(field, formValue) !== normalizeValue(field, dbValue)) {
      mismatches.push({
        field,
        formValue: String(formValue),
        dbValue: String(dbValue),
      })
    }
  }

  if (comparedFields.length === 0) return null

  return {
    comparedFields,
    mismatches,
    accurate: mismatches.length === 0,
  }
}

export function analyzeMockDb(text, formText = text) {
  const keyFields = parseFormFields(text)
  const formFields = parseFormFields(formText)
  const identifiers = collectIdentifiers(text, keyFields)
  const { customer, matchedBy } = findCustomer(identifiers)
  const comparison = compareFields(formFields, customer)

  return {
    formFields,
    identifiers,
    lookupAttempted: Object.keys(identifiers).length > 0,
    customer,
    matchedBy,
    comparison,
  }
}

function describeIdentifiers(identifiers) {
  return Object.entries(identifiers)
    .map(([field, value]) => `${FIELD_LABELS[field]} ${value}`)
    .join(', ')
}

export function buildDbContext(analysis) {
  const lines = ['[Mock customer database]']

  if (analysis.customer) {
    lines.push('Authoritative customer record:')
    lines.push(JSON.stringify(analysis.customer, null, 2))
    lines.push(
      'Treat this record as correct. Compare it with the submitted form and flag any form field that differs.',
    )
  } else if (analysis.lookupAttempted) {
    lines.push(
      `No customer record matched these identifiers: ${describeIdentifiers(analysis.identifiers)}.`,
    )
    lines.push('Treat the customer as absent from the database.')
  } else {
    lines.push(
      'No customer ID, NRIC/FIN, or email was found in the submitted form, so no customer record could be loaded.',
    )
  }

  lines.push('[/Mock customer database]')
  return lines.join('\n')
}

function mismatchTruth(comparison) {
  if (comparison.mismatches.length === 0) return 'none'
  const fields = [...new Set(comparison.mismatches.map((mismatch) => mismatch.field))]
  if (fields.length > 1) return 'multiple'
  return FIELD_OPTION_KEYS[fields[0]] ?? 'other'
}

export function mockDbExpected(analysis) {
  if (!analysis) return {}

  const expected = {}
  if (analysis.lookupAttempted) {
    expected[DB_QUESTION_KEYS.exists] = Boolean(analysis.customer)
  }
  if (analysis.comparison) {
    expected[DB_QUESTION_KEYS.accurate] = analysis.comparison.accurate
    expected[DB_QUESTION_KEYS.mismatch] = mismatchTruth(analysis.comparison)
  }

  return expected
}

function choiceProbability(answer, choice) {
  const probability = answer?.probabilities?.[choice]
  return typeof probability === 'number' ? probability : null
}

export function scoreMockDb(analysis, answers) {
  if (!analysis) return []

  const scores = []

  const existsAnswer = answers?.[DB_QUESTION_KEYS.exists]
  if (
    analysis.lookupAttempted &&
    existsAnswer?.type === 'noul' &&
    typeof existsAnswer.noul === 'number'
  ) {
    const predicted = existsAnswer.noul >= 0.5
    const truth = Boolean(analysis.customer)
    scores.push({
      key: DB_QUESTION_KEYS.exists,
      label: 'Customer exists',
      modelLabel: predicted ? 'Yes' : 'No',
      truthLabel: truth ? 'Yes' : 'No',
      pass: predicted === truth,
      detail: `p(yes) ${(existsAnswer.noul * 100).toFixed(1)}%`,
    })
  }

  const accurateAnswer = answers?.[DB_QUESTION_KEYS.accurate]
  if (
    analysis.comparison &&
    accurateAnswer?.type === 'noul' &&
    typeof accurateAnswer.noul === 'number'
  ) {
    const predicted = accurateAnswer.noul >= 0.5
    const truth = analysis.comparison.accurate
    scores.push({
      key: DB_QUESTION_KEYS.accurate,
      label: 'Form accurate',
      modelLabel: predicted ? 'Yes' : 'No',
      truthLabel: truth ? 'Yes' : 'No',
      pass: predicted === truth,
      detail: `p(yes) ${(accurateAnswer.noul * 100).toFixed(1)}%`,
    })
  }

  const mismatchAnswer = answers?.[DB_QUESTION_KEYS.mismatch]
  if (analysis.comparison && mismatchAnswer?.type === 'choice') {
    const predicted = mismatchAnswer.choice ?? '—'
    const truth = mismatchTruth(analysis.comparison)
    const probability = choiceProbability(mismatchAnswer, predicted)
    scores.push({
      key: DB_QUESTION_KEYS.mismatch,
      label: 'Mismatched field',
      modelLabel: predicted,
      truthLabel: truth,
      pass: predicted === truth,
      detail: probability == null ? 'choice' : `p ${(probability * 100).toFixed(1)}%`,
    })
  }

  return scores
}
