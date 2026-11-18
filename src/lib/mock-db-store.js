import { useSyncExternalStore } from 'react'
import defaultCustomers from '../data/mock-customers.json'

const STORAGE_KEY = 'decision-lab:mock-customers:v1'

export const CORE_CUSTOMER_FIELDS = [
  'customer_id',
  'name',
  'nric',
  'email',
  'phone',
  'address',
  'monthly_income',
]

const CORE_FIELD_SET = new Set(CORE_CUSTOMER_FIELDS)

export function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function clone(records) {
  return records.map((record) => ({ ...record }))
}

export function normalizeCustomer(record) {
  const source = record && typeof record === 'object' ? record : {}
  const income = source.monthly_income
  const incomeText = income == null ? '' : String(income).trim()
  const incomeDigits = incomeText.replace(/[^0-9.]/g, '')
  const parsedIncome =
    incomeText === '' || incomeDigits === '' || !Number.isFinite(Number(incomeDigits))
      ? null
      : Number(incomeDigits)

  const customer = {
    customer_id: String(source.customer_id ?? '').trim().toUpperCase(),
    name: String(source.name ?? '').trim(),
    nric: String(source.nric ?? '').trim().toUpperCase(),
    email: String(source.email ?? '').trim(),
    phone: String(source.phone ?? '').trim(),
    address: String(source.address ?? '').trim(),
    monthly_income: parsedIncome,
  }

  for (const [key, value] of Object.entries(source)) {
    if (CORE_FIELD_SET.has(key)) continue
    const customKey = normalizeKey(key)
    if (!customKey || CORE_FIELD_SET.has(customKey) || value == null) continue
    customer[customKey] = typeof value === 'string' ? value.trim() : value
  }

  return customer
}

function normalizeList(records) {
  return records
    .filter((record) => record && typeof record === 'object')
    .map(normalizeCustomer)
    .filter((record) => record.customer_id)
}

function load() {
  if (typeof window === 'undefined') return clone(defaultCustomers)

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw == null) return clone(defaultCustomers)
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return clone(defaultCustomers)
    return normalizeList(parsed)
  } catch {
    return clone(defaultCustomers)
  }
}

let customers = load()
const listeners = new Set()

export function getMockCustomers() {
  return customers
}

export function getDefaultMockCustomers() {
  return clone(defaultCustomers)
}

export function subscribeMockCustomers(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit() {
  for (const listener of listeners) listener()
}

export function setMockCustomers(records) {
  customers = normalizeList(records)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customers))
  } catch {
    // The in-memory list still works if storage is unavailable.
  }
  emit()
}

export function resetMockCustomers() {
  customers = clone(defaultCustomers)
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore unavailable storage.
  }
  emit()
}

export function useMockCustomers() {
  return useSyncExternalStore(
    subscribeMockCustomers,
    getMockCustomers,
    getMockCustomers,
  )
}
