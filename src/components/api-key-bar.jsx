import { useState } from 'react'
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, XCircle } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ApiKeyBar({
  value,
  onChange,
  envKey,
  effectiveKey,
  onClear,
  onTest,
  testing,
  testResult,
}) {
  const [visible, setVisible] = useState(false)
  const source = value.trim() ? 'session' : envKey ? 'env' : 'none'

  return (
    <div className="border-y bg-muted/20">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <KeyRound className="size-3.5" />
          Gemini API key
        </div>

        <div className="relative w-full max-w-sm">
          <Input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={
              envKey ? 'Using VITE_GEMINI_API_KEY from .env' : 'Paste an AI Studio key'
            }
            autoComplete="off"
            spellCheck={false}
            className="h-8 pr-9 font-mono text-xs"
            aria-label="Gemini API key"
          />
          <button
            type="button"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Hide API key' : 'Show API key'}
          >
            {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={onTest}
          disabled={!effectiveKey || testing}
        >
          {testing ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {testing ? 'Testing' : 'Test key'}
        </Button>

        {value ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Forget
          </Button>
        ) : null}

        <Badge variant={source === 'session' ? 'secondary' : 'outline'} className="text-[11px]">
          {source === 'session' ? 'this tab' : source === 'env' ? 'from .env' : 'no key'}
        </Badge>

        {testResult ? (
          <span
            className={cn(
              'flex min-w-0 basis-full items-center gap-1.5 text-xs sm:basis-auto',
              testResult.ok
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400',
            )}
            title={testResult.message}
          >
            {testResult.ok ? (
              <CheckCircle2 className="size-3.5 shrink-0" />
            ) : (
              <XCircle className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{testResult.message}</span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
