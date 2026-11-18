import { AlertTriangle } from 'lucide-react'
import { cn } from 'cn'

export function ErrorBanner({ error, className }) {
  if (!error) return null

  const message = typeof error === 'string' ? error : error.message
  const details = typeof error === 'object' ? error.details : null
  const meta = [
    typeof error === 'object' ? error.code : null,
    typeof error === 'object' && error.status ? `HTTP ${error.status}` : null,
  ].filter(Boolean)

  return (
    <div
      className={cn(
        'rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive',
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{message}</p>
          {meta.length > 0 ? (
            <p className="font-mono text-[11px] opacity-70">{meta.join(' · ')}</p>
          ) : null}
          {details ? (
            <details className="text-xs">
              <summary className="cursor-pointer select-none opacity-80">Response details</summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-background/60 p-2 font-mono text-[11px] text-foreground">
                {JSON.stringify(details, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  )
}
