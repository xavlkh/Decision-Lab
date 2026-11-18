export const MAX_FILES = 5
export const MAX_BATCH_FILES = 20
export const MAX_FILE_BYTES = 15 * 1024 * 1024
export const MAX_TOTAL_BYTES = 30 * 1024 * 1024

export const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/bmp',
  'image/tiff',
])

export const MIME_BY_EXTENSION = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  pdf: 'application/pdf',
}

export const ACCEPT = [...IMAGE_MIME_TYPES, 'application/pdf'].join(',')

export function resolveMimeType(file) {
  const type = String(file.type ?? '').toLowerCase()
  if (type === 'application/x-pdf') return 'application/pdf'
  if (type) return type

  const extension = file.name.split('.').pop()?.toLowerCase()
  return MIME_BY_EXTENSION[extension] ?? ''
}

export function isSupportedMimeType(mimeType) {
  return IMAGE_MIME_TYPES.has(mimeType) || mimeType === 'application/pdf'
}

export function attachmentKind(mimeType) {
  return mimeType === 'application/pdf' ? 'document' : 'image'
}

export function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}
