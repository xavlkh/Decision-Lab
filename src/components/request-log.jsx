import { ErrorBanner } from '@/components/error-banner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatMs, formatTokens } from '@/lib/decisions'

function JsonBlock({ label, value }) {
  if (!value) return null
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <pre className="max-h-72 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-[11px]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

export function RequestLog({ entries, onClear }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Request log</CardTitle>
            <CardDescription>
              The last 20 calls from this tab. Request bodies never contain the API key.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onClear} disabled={entries.length === 0}>
            Clear
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No requests yet. Run a decision or the benchmark to populate this log.
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <details key={entry.id} className="rounded-xl border bg-card p-3 text-sm">
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                  <Badge variant={entry.status === 'ok' ? 'secondary' : 'destructive'}>
                    {entry.status}
                  </Badge>
                  <span className="font-medium">{entry.label}</span>
                  <Badge variant="outline" className="text-[11px]">
                    {entry.kind}
                  </Badge>
                  <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                    {entry.elapsedMs ? <span>{formatMs(entry.elapsedMs)}</span> : null}
                    {entry.usage?.total_input_tokens ? (
                      <span>{formatTokens(entry.usage.total_input_tokens)} tokens</span>
                    ) : null}
                    <span>{new Date(entry.at).toLocaleTimeString()}</span>
                  </span>
                </summary>

                <div className="mt-3 space-y-3">
                  {entry.error ? <ErrorBanner error={entry.error} /> : null}
                  <div className="grid gap-3 lg:grid-cols-2">
                    <JsonBlock label="Request" value={entry.request} />
                    <JsonBlock label="Response" value={entry.response} />
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
