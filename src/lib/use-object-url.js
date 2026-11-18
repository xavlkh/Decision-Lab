import { useEffect, useState } from 'react'

export function useObjectUrl(file) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    if (!file) return undefined

    const next = URL.createObjectURL(file)
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])

  return url
}
