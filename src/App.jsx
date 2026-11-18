import { useCallback, useEffect, useState } from 'react'
import { ApiKeyBar } from '@/components/api-key-bar'
import { BenchmarkPanel } from '@/components/benchmark-panel'
import { DocumentsPanel } from '@/components/documents-panel'
import { MockDbPanel } from '@/components/mock-db-panel'
import { PlaygroundPanel } from '@/components/playground-panel'
import { RequestLog } from '@/components/request-log'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createDecision, formatMs, formatTokens } from '@/lib/decisions'

const ENV_KEY = (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim()
const STORAGE_KEY = 'gemini-decision-lab-key'

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function App() {
  const [sessionKey, setSessionKey] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [tab, setTab] = useState('playground')
  const [logs, setLogs] = useState([])
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    try {
      if (sessionKey) sessionStorage.setItem(STORAGE_KEY, sessionKey)
      else sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Storage can be unavailable in private modes. The key still works for this render.
    }
  }, [sessionKey])

  const effectiveKey = sessionKey.trim() || ENV_KEY

  const pushLog = useCallback((entry) => {
    const next = { id: makeId(), at: Date.now(), ...entry }
    if (entry.error) {
      next.error = {
        message: entry.error.message,
        code: entry.error.code,
        status: entry.error.status,
        details: entry.error.details,
      }
    }
    setLogs((current) => [next, ...current].slice(0, 20))
  }, [])

  function handleKeyChange(next) {
    setSessionKey(next)
    setTestResult(null)
  }

  function clearKey() {
    setSessionKey('')
    setTestResult(null)
  }

  async function testKey() {
    if (!effectiveKey) return

    setTesting(true)
    setTestResult(null)

    try {
      const result = await createDecision({
        apiKey: effectiveKey,
        input: 'I was charged twice for my morning coffee.',
        questions: {
          connection_ok: {
            type: 'noul',
            instructions: 'Is the customer reporting a duplicate charge?',
          },
        },
      })

      setTestResult({
        ok: true,
        message: `Connected in ${formatMs(result.elapsedMs)} · ${formatTokens(
          result.usage?.total_input_tokens ?? 0,
        )} input tokens`,
      })
      pushLog({
        kind: 'key-test',
        label: 'Connection test',
        status: 'ok',
        request: result.request,
        response: result.response,
        usage: result.usage,
        elapsedMs: result.elapsedMs,
      })
    } catch (error) {
      if (error?.name === 'AbortError') return
      setTestResult({ ok: false, message: error.message })
      pushLog({
        kind: 'key-test',
        label: 'Connection test',
        status: 'error',
        error,
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-4 px-4 py-6 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground font-heading text-sm font-semibold text-background">
              DL
            </div>
            <div>
              <h1 className="font-heading text-xl font-semibold tracking-tight">
                Gemini Decision Lab
              </h1>
              <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
                Test <span className="font-mono text-xs">gemini-decision-1</span> with typed
                questions. Calibrated probabilities, no generated text.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Badge variant="outline" className="font-mono">
              gemini-decision-1
            </Badge>
            <span className="text-[11px] text-muted-foreground">Decisions API · v1beta</span>
          </div>
        </div>
      </header>

      <ApiKeyBar
        value={sessionKey}
        onChange={handleKeyChange}
        envKey={ENV_KEY}
        effectiveKey={effectiveKey}
        onClear={clearKey}
        onTest={testKey}
        testing={testing}
        testResult={testResult}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="playground">Playground</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="benchmark">Benchmark</TabsTrigger>
              <TabsTrigger value="mock-db">Mock DB</TabsTrigger>
              <TabsTrigger value="log">
                Request log{logs.length > 0 ? ` (${logs.length})` : ''}
              </TabsTrigger>
            </TabsList>
            <p className="text-xs text-muted-foreground">
              $0.10 / 1M input tokens · output tokens always 0
            </p>
          </div>

          <TabsContent
            value="playground"
            className="mt-4 data-[state=inactive]:hidden"
            forceMount
          >
            <PlaygroundPanel
              apiKey={effectiveKey}
              hasKey={Boolean(effectiveKey)}
              pushLog={pushLog}
              onOpenMockDb={() => setTab('mock-db')}
            />
          </TabsContent>

          <TabsContent
            value="benchmark"
            className="mt-4 data-[state=inactive]:hidden"
            forceMount
          >
            <BenchmarkPanel
              apiKey={effectiveKey}
              hasKey={Boolean(effectiveKey)}
              pushLog={pushLog}
            />
          </TabsContent>

          <TabsContent
            value="documents"
            className="mt-4 data-[state=inactive]:hidden"
            forceMount
          >
            <DocumentsPanel
              apiKey={effectiveKey}
              hasKey={Boolean(effectiveKey)}
              pushLog={pushLog}
              onOpenMockDb={() => setTab('mock-db')}
            />
          </TabsContent>

          <TabsContent value="mock-db" className="mt-4">
            <MockDbPanel />
          </TabsContent>

          <TabsContent value="log" className="mt-4">
            <RequestLog entries={logs} onClear={() => setLogs([])} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <span>
            Local test harness. The key stays in this tab or your ignored .env file.
          </span>
          <a
            href="https://aistudio.google.com/docs/decisions-api"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Decisions API docs
          </a>
        </div>
      </footer>
    </div>
  )
}
