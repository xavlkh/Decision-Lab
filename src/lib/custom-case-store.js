const DB_NAME = 'decisionlab'
const DB_VERSION = 1
const STORE = 'custom-benchmark-cases'
const CASES_KEY = 'cases'

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'))
  })
}

export async function loadCustomCases() {
  if (!hasIndexedDb()) return []

  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly')
    const request = transaction.objectStore(STORE).get(CASES_KEY)

    request.onsuccess = () => {
      const stored = request.result
      resolve(Array.isArray(stored) ? stored : [])
    }
    request.onerror = () => reject(request.error ?? new Error('Could not read saved cases.'))

    transaction.oncomplete = () => database.close()
    transaction.onerror = () => database.close()
  })
}

export async function saveCustomCases(cases) {
  if (!hasIndexedDb()) {
    throw new Error('This browser does not support local saves, so custom cases last for this tab only.')
  }

  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).put(cases, CASES_KEY)

    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('Could not save custom cases.'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error ?? new Error('Saving custom cases was aborted.'))
    }
  })
}
