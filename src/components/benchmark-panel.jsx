import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  Loader2,
  Play,
  Square,
  XCircle,
} from 'lucide-react'
import { cn } from 'cn'
import { ConfidenceBadge } from '@/components/confidence-badge'
import { CustomCaseDialog } from '@/components/custom-case-dialog'
import { CustomCasesCard } from '@/components/custom-cases-card'
import { ErrorBanner } from '@/components/error-banner'
import { MediaPreviewList } from '@/components/media-preview'
import { PreviewDialog, QuestionPreview } from '@/components/preview-dialog'
import { ProbabilityBar } from '@/components/probability-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  BENCHMARK_CASES,
  BENCHMARK_QUESTIONS,
  calibrationBuckets,
  expectedLabel,
  questionsForCase,
  scoreError,
  scoreRun,
  summarizeRuns,
} from '@/lib/benchmark'
import { loadCustomCases, saveCustomCases } from '@/lib/custom-case-store'
import { useMockCustomers } from '@/lib/mock-db-store'
import { analyzeMockDb, buildDbContext, mockDbExpected } from '@/lib/mock-db'
import {
  createDecision,
  formatMs,
  formatPct,
  formatTokens,
  formatUsd,
  toApiQuestion,
} from '@/lib/decisions'
import { readAsBase64 } from '@/lib/attachments'

function Metric({ label, value, hint }) {
  return (
    <div className="bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-lg font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

function averageConfidence(run) {
  if (run.questions.length === 0) return 0
  return run.questions.reduce((sum, question) => sum + question.confidence, 0) / run.questions.length
}

function RunDetails({ run }) {
  return (
    <div className="space-y-3 py-1">
      {run.blocked ? <ErrorBanner error={run.error} /> : null}

      <div className="grid gap-2 lg:grid-cols-3">
        {run.questions.map((question) => (
          <div key={question.id} className="rounded-lg border bg-card p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-medium">{question.id}</span>
              <Badge variant={question.pass ? 'secondary' : 'destructive'}>
                {question.pass ? 'pass' : 'fail'}
              </Badge>
            </div>

            <dl className="mt-2 space-y-1">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Expected</dt>
                <dd className="text-right font-mono">{String(question.correctLabel ?? '')}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Got</dt>
                <dd className="text-right font-mono">{String(question.label ?? '')}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Confidence</dt>
                <dd className="text-right tabular-nums">{formatPct(question.confidence, 1)}</dd>
              </div>
            </dl>

            {question.error ? (
              <p className="mt-2 text-rose-500 dark:text-rose-400">{question.error}</p>
            ) : null}

            {question.answer?.type === 'choice' ? (
              <div className="mt-2 space-y-1.5">
                {Object.entries(question.answer.probabilities ?? {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, probability]) => (
                    <div key={key} className="grid grid-cols-[5.5rem_1fr_2.25rem] items-center gap-2">
                      <span className="truncate font-mono">{key}</span>
                      <ProbabilityBar value={probability} height="h-1" />
                      <span className="text-right tabular-nums">{formatPct(probability, 0)}</span>
                    </div>
                  ))}
              </div>
            ) : null}

            {question.answer?.type === 'score' ? (
              <div className="mt-2 space-y-1">
                {Object.entries(question.answer.probabilities ?? {})
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([index, probability]) => (
                    <div key={index} className="grid grid-cols-[1rem_1fr_2.25rem] items-center gap-2">
                      <span className={index === String(question.levelIndex) ? 'font-semibold' : 'text-muted-foreground'}>
                        {index}
                      </span>
                      <ProbabilityBar value={probability} height="h-1" />
                      <span className="text-right tabular-nums">{formatPct(probability, 0)}</span>
                    </div>
                  ))}
              </div>
            ) : null}

            {question.answer?.type === 'noul' ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">P(yes)</span>
                <span className="tabular-nums">{formatPct(question.answer.noul, 1)}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer select-none text-muted-foreground">Raw response</summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-[11px]">
          {JSON.stringify(run.raw, null, 2)}
        </pre>
      </details>
    </div>
  )
}

export function BenchmarkPanel({ apiKey, hasKey, pushLog }) {
  // Re-render custom-case DB previews when the mock DB changes.
  useMockCustomers()

  const [included, setIncluded] = useState(() =>
    Object.fromEntries(BENCHMARK_CASES.map((testCase) => [testCase.id, true])),
  )
  const [repeats, setRepeats] = useState('1')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(new Set())
  const [failuresOnly, setFailuresOnly] = useState(false)
  const [previewCase, setPreviewCase] = useState(null)
  const [copied, setCopied] = useState(false)
  const [customCases, setCustomCases] = useState([])
  const [casesLoaded, setCasesLoaded] = useState(false)
  const [storeReady, setStoreReady] = useState(false)
  const [storeError, setStoreError] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingCase, setEditingCase] = useState(null)
  const [editorKey, setEditorKey] = useState(0)
  const [imageResolution, setImageResolution] = useState('low')
  const abortRef = useRef(null)

  const allCases = useMemo(() => [...BENCHMARK_CASES, ...customCases], [customCases])
  const selectedCases = allCases.filter((testCase) => included[testCase.id] !== false)
  const allSelected = allCases.length > 0 && selectedCases.length === allCases.length
  const someSelected = selectedCases.length > 0 && !allSelected
  const selectAllRef = useRef(null)
  const summary = useMemo(() => summarizeRuns(results), [results])
  const buckets = useMemo(() => calibrationBuckets(results), [results])
  const visibleResults = failuresOnly ? results.filter((run) => !run.pass) : results
  const previewQuestions = previewCase ? questionsForCase(previewCase) : {}
  const previewDbAnalysis = previewCase?.dbLookupKey
    ? analyzeMockDb(previewCase.dbLookupKey, previewCase.state ?? '')
    : null
  const previewExpected = previewCase
    ? { ...previewCase.expected, ...mockDbExpected(previewDbAnalysis) }
    : {}

  useEffect(() => {
    let active = true

    loadCustomCases()
      .then((saved) => {
        if (!active) return
        setCustomCases(saved)
        setStoreReady(true)
      })
      .catch((caught) => {
        if (!active) return
        setStoreError(
          `Could not load saved cases: ${caught?.message ?? 'unknown error'}. Custom cases will last for this tab only.`,
        )
      })
      .finally(() => {
        if (active) setCasesLoaded(true)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!storeReady) return

    saveCustomCases(customCases)
      .then(() => setStoreError(null))
      .catch((caught) => {
        setStoreError(
          `Could not save custom cases: ${caught?.message ?? 'unknown error'}. They stay in this tab.`,
        )
      })
  }, [customCases, storeReady])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  function toggleCase(id) {
    setIncluded((current) => ({ ...current, [id]: current[id] === false }))
  }

  function toggleAllCases() {
    setIncluded(
      Object.fromEntries(allCases.map((testCase) => [testCase.id, !allSelected])),
    )
  }

  function toggleRun(key) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openAddCase() {
    setEditingCase(null)
    setEditorKey((key) => key + 1)
    setEditorOpen(true)
  }

  function selectCustomOnly() {
    setIncluded(
      Object.fromEntries([
        ...BENCHMARK_CASES.map((testCase) => [testCase.id, false]),
        ...customCases.map((testCase) => [testCase.id, true]),
      ]),
    )
  }

  function openEditCase(testCase) {
    setEditingCase(testCase)
    setEditorKey((key) => key + 1)
    setEditorOpen(true)
  }

  function saveCase(nextCase) {
    setCustomCases((current) => {
      const exists = current.some((item) => item.id === nextCase.id)
      return exists
        ? current.map((item) => (item.id === nextCase.id ? nextCase : item))
        : [...current, nextCase]
    })
    setEditorOpen(false)
  }

  function deleteCase(testCase) {
    if (!window.confirm(`Delete “${testCase.title}”?`)) return

    setCustomCases((current) => current.filter((item) => item.id !== testCase.id))
    setIncluded((current) => {
      const next = { ...current }
      delete next[testCase.id]
      return next
    })
    if (previewCase?.id === testCase.id) setPreviewCase(null)
  }

  async function buildCaseInput(testCase) {
    if (!testCase.media?.length) return testCase.state

    const blocks = []
    if (testCase.state?.trim()) {
      blocks.push({ type: 'text', text: testCase.state })
    }

    for (const item of testCase.media) {
      const data = await readAsBase64(item.file)

      if (item.kind === 'document') {
        blocks.push({ type: 'document', data, mime_type: item.mimeType })
      } else {
        blocks.push({
          type: 'image',
          data,
          mime_type: item.mimeType,
          resolution: imageResolution,
        })
      }
    }

    return blocks
  }

  async function runBenchmark() {
    if (selectedCases.length === 0) return

    setRunning(true)
    setError(null)
    setResults([])
    setExpanded(new Set())

    const repeatCount = Number(repeats)
    const total = selectedCases.length * repeatCount
    setProgress({ done: 0, total, current: 'Starting…' })

    const collected = []
    const controller = new AbortController()
    abortRef.current = controller

    try {
      runLoop: for (let repeat = 1; repeat <= repeatCount; repeat += 1) {
        for (const testCase of selectedCases) {
          setProgress((current) => ({
            ...current,
            current: repeatCount > 1 ? `${testCase.title} · run ${repeat}` : testCase.title,
          }))

          const dbAnalysis = testCase.dbLookupKey
            ? analyzeMockDb(testCase.dbLookupKey, testCase.state ?? '')
            : null
          const dbExpected = mockDbExpected(dbAnalysis)
          const caseQuestions = questionsForCase(testCase)
          const apiQuestions = Object.fromEntries(
            Object.entries(caseQuestions).map(([id, question]) => [
              id,
              toApiQuestion(question),
            ]),
          )
          const scoredCase = {
            ...testCase,
            questions: caseQuestions,
            expected: { ...testCase.expected, ...dbExpected },
          }

          try {
            let input = await buildCaseInput(testCase)

            if (dbAnalysis) {
              const context = buildDbContext(dbAnalysis)
              if (Array.isArray(input)) {
                const [first, ...rest] = input
                input =
                  first?.type === 'text'
                    ? [{ ...first, text: `${context}\n\n${first.text}` }, ...rest]
                    : [{ type: 'text', text: context }, ...input]
              } else {
                input = `${context}\n\n${input}`
              }
            }

            const response = await createDecision({
              apiKey,
              input,
              questions: apiQuestions,
              signal: controller.signal,
            })

            const scored = scoreRun(scoredCase, response)
            collected.push({ ...scored, run: repeat })
            setResults([...collected])
            setProgress((current) => ({ ...current, done: current.done + 1 }))

            pushLog({
              kind: 'benchmark',
              label: repeatCount > 1 ? `${testCase.title} · run ${repeat}` : testCase.title,
              status: 'ok',
              ...response,
            })
          } catch (caught) {
            if (caught?.name === 'AbortError') throw caught

            const fatal =
              caught?.code === 'missing_key' ||
              caught?.code === 'network' ||
              caught?.status === 401 ||
              caught?.status === 403 ||
              caught?.status === 429

            if (fatal) {
              setError(caught)
              pushLog({
                kind: 'benchmark',
                label: testCase.title,
                status: 'error',
                error: caught,
              })
              break runLoop
            }

            collected.push({ ...scoreError(scoredCase, caught), run: repeat })
            setResults([...collected])
            setProgress((current) => ({ ...current, done: current.done + 1 }))
            setError(caught)
            pushLog({
              kind: 'benchmark',
              label: `${testCase.title} · blocked`,
              status: 'error',
              error: caught,
            })
          }
        }
      }

      setProgress((current) => ({
        ...current,
        current: current.done >= current.total ? 'Complete' : 'Stopped early',
      }))
    } catch (caught) {
      if (caught?.name !== 'AbortError') {
        setError(caught)
        pushLog({
          kind: 'benchmark',
          label: 'Benchmark request',
          status: 'error',
          error: caught,
        })
      }
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  async function copyResults() {
    const runs = results.map((run) => {
      const copy = { ...run }
      delete copy.raw
      return copy
    })
    const payload = {
      runAt: new Date().toISOString(),
      model: 'gemini-decision-1',
      summary,
      runs,
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(new Error('Could not copy to the clipboard.'))
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Benchmark suite</CardTitle>
              <CardDescription>
                {BENCHMARK_CASES.length} built-in triage cases plus your own text, image,
                or PDF cases. Ground truth is fixed per case, so scores are not
                self-reported.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className="size-4 accent-foreground"
                  checked={allSelected}
                  disabled={running || !casesLoaded}
                  onChange={toggleAllCases}
                  aria-label="Select all benchmark cases"
                />
                Select all cases
              </label>
              <Select value={repeats} onValueChange={setRepeats}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 run</SelectItem>
                  <SelectItem value="3">3 runs</SelectItem>
                  <SelectItem value="5">5 runs</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={runBenchmark} disabled={running || !hasKey || !casesLoaded || selectedCases.length === 0}>
                {running ? <Loader2 className="animate-spin" /> : <Play />}
                {running ? 'Running…' : `Run ${selectedCases.length * Number(repeats)}`}
              </Button>
              {running ? (
                <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                  <Square />
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(BENCHMARK_QUESTIONS).map(([id, question]) => (
              <Badge key={id} variant="outline" className="font-mono">
                {id} · {question.type}
              </Badge>
            ))}
            <Badge variant="secondary">$0.10 / 1M input</Badge>
            <Badge variant="secondary">0 output tokens</Badge>
          </div>

          {!hasKey ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Add a Gemini API key above to run the suite.
            </p>
          ) : null}

          <div className="max-h-80 overflow-auto rounded-xl border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">Include</span>
                  </TableHead>
                  <TableHead>Case</TableHead>
                  <TableHead className="w-[320px]">Expected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BENCHMARK_CASES.map((testCase) => (
                  <TableRow key={testCase.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4 accent-foreground"
                        checked={included[testCase.id] !== false}
                        onChange={() => toggleCase(testCase.id)}
                        aria-label={`Include ${testCase.title}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{testCase.title}</span>
                        <Badge variant="outline">{testCase.tag}</Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Preview ${testCase.title}`}
                          onClick={() => setPreviewCase(testCase)}
                        >
                          <Eye />
                        </Button>
                      </div>
                      <p className="mt-1 line-clamp-2 max-w-xl text-xs text-muted-foreground">
                        {testCase.state}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">
                          refund {testCase.expected.is_refund_request ? 'yes' : 'no'}
                        </Badge>
                        <Badge variant="outline" className="font-mono">
                          {testCase.expected.route_to}
                        </Badge>
                        <Badge variant="outline">urgency {testCase.expected.urgency}</Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {progress ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="truncate">{progress.current}</span>
                <span className="tabular-nums">
                  {progress.done}/{progress.total}
                </span>
              </div>
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
            </div>
          ) : null}

          {error ? <ErrorBanner error={error} /> : null}
        </CardContent>
      </Card>

      <CustomCasesCard
        cases={customCases}
        included={included}
        onToggle={toggleCase}
        onAdd={openAddCase}
        onEdit={openEditCase}
        onDelete={deleteCase}
        onPreview={setPreviewCase}
        onSelectCustomOnly={selectCustomOnly}
        imageResolution={imageResolution}
        onImageResolutionChange={setImageResolution}
        disabled={running || !casesLoaded}
        storeError={storeError}
      />

      {summary ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-foreground/10 sm:grid-cols-3 lg:grid-cols-6">
            <Metric
              label="Case accuracy"
              value={formatPct(summary.caseAccuracy, 0)}
              hint={`${summary.runCount} runs · ${summary.caseCount} cases`}
            />
            <Metric
              label="Question accuracy"
              value={formatPct(summary.questionAccuracy, 0)}
              hint={`${formatPct(summary.toleranceAccuracy, 0)} within one level`}
            />
            <Metric
              label="Mean confidence"
              value={summary.meanConfidence.toFixed(2)}
              hint="Across every answer"
            />
            <Metric
              label="Latency"
              value={formatMs(summary.p50)}
              hint={`p95 ${formatMs(summary.p95)}`}
            />
            <Metric
              label="Input tokens"
              value={formatTokens(summary.tokens)}
              hint="Output tokens: 0"
            />
            <Metric
              label="Estimated cost"
              value={formatUsd(summary.cost)}
              hint={
                summary.runCount > summary.caseCount
                  ? `${formatPct(summary.consistency, 0)} consistent`
                  : 'At $0.10 / 1M input'
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle>Results</CardTitle>
                    <CardDescription>Click a row to see the per-question probabilities.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={failuresOnly ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setFailuresOnly((current) => !current)}
                    >
                      Failures only
                    </Button>
                    <Button variant="outline" size="sm" onClick={copyResults}>
                      <Copy />
                      {copied ? 'Copied' : 'Copy JSON'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" />
                        <TableHead>Case</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Checks</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead className="text-right">Latency</TableHead>
                        <TableHead className="text-right">Tokens</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleResults.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                            No runs match this filter.
                          </TableCell>
                        </TableRow>
                      ) : null}

                      {visibleResults.map((run) => {
                        const key = `${run.caseId}-${run.run}`
                        const isOpen = expanded.has(key)
                        return (
                          <Fragment key={key}>
                            <TableRow
                              className="cursor-pointer"
                              onClick={() => toggleRun(key)}
                            >
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    toggleRun(key)
                                  }}
                                >
                                  {isOpen ? <ChevronDown /> : <ChevronRight />}
                                </Button>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">{run.title}</div>
                                <div className="text-xs text-muted-foreground">
                                  {run.tag}
                                  {summary.runCount > summary.caseCount ? ` · run ${run.run}` : ''}
                                </div>
                              </TableCell>
                              <TableCell>
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1.5 text-xs font-medium',
                                    run.pass
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : run.blocked
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-rose-600 dark:text-rose-400',
                                  )}
                                >
                                  {run.blocked ? (
                                    <AlertTriangle className="size-3.5" />
                                  ) : run.pass ? (
                                    <CheckCircle2 className="size-3.5" />
                                  ) : (
                                    <XCircle className="size-3.5" />
                                  )}
                                  {run.blocked ? 'Blocked' : run.pass ? 'Pass' : 'Fail'}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {run.questions.map((question) => (
                                    <span
                                      key={question.id}
                                      title={`${question.id}: ${question.pass ? 'pass' : 'fail'}`}
                                      className={cn(
                                        'rounded-md px-1.5 py-0.5 font-mono text-[11px]',
                                        question.pass
                                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                          : 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
                                      )}
                                    >
                                      {question.id.split('_')[0]} {question.pass ? '✓' : '✗'}
                                    </span>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                {run.blocked ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : (
                                  <ConfidenceBadge confidence={averageConfidence(run)} />
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatMs(run.elapsedMs)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatTokens(run.tokens)}
                              </TableCell>
                            </TableRow>
                            {isOpen ? (
                              <TableRow>
                                <TableCell colSpan={7} className="bg-muted/30">
                                  <RunDetails run={run} />
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Confidence calibration</CardTitle>
                <CardDescription>
                  Accuracy per confidence bucket. Use this to pick a review threshold.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {buckets.map((bucket) => {
                  const accuracy = bucket.total ? bucket.correct / bucket.total : 0
                  return (
                    <div
                      key={bucket.label}
                      className="grid grid-cols-[3.75rem_1fr_3rem] items-center gap-2 text-xs"
                    >
                      <span className="text-muted-foreground">{bucket.label}</span>
                      <ProbabilityBar value={accuracy} height="h-2" />
                      <span className="text-right tabular-nums">
                        {bucket.total ? `${Math.round(accuracy * 100)}%` : '—'}
                      </span>
                    </div>
                  )
                })}
                <p className="pt-1 text-[11px] text-muted-foreground">
                  n = {buckets.reduce((sum, bucket) => sum + bucket.total, 0)} answers
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      <PreviewDialog
        open={Boolean(previewCase)}
        onOpenChange={(open) => {
          if (!open) setPreviewCase(null)
        }}
        title={previewCase?.title ?? 'Benchmark case'}
        description={
          previewCase
            ? [
                previewCase.tag,
                previewCase.media?.length
                  ? `${previewCase.media.length} attachment${
                      previewCase.media.length === 1 ? '' : 's'
                    }`
                  : 'text only',
                previewCase.custom ? 'custom case' : 'benchmark case',
              ].join(' · ')
            : null
        }
      >
        {previewCase ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Full input</h3>
              {previewCase.state ? (
                <p className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-sm">
                  {previewCase.state}
                </p>
              ) : (
                <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
                  Media-only input.
                </p>
              )}
              {previewCase.dbLookupKey ? (
                <p className="text-[11px] text-muted-foreground">
                  Mock DB context for “{previewCase.dbLookupKey}” is prepended at run
                  time.
                </p>
              ) : null}
            </div>

            {previewCase.media?.length ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Attachments</h3>
                <MediaPreviewList media={previewCase.media} />
              </div>
            ) : null}

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Expected answers</h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(previewExpected).map(([id, value]) => (
                  <Badge key={id} variant="outline">
                    {id} {expectedLabel(previewQuestions[id], value)}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Questions</h3>
              <QuestionPreview questions={previewQuestions} />
            </div>
          </div>
        ) : null}
      </PreviewDialog>

      <CustomCaseDialog
        key={editorKey}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        caseDef={editingCase}
        onSave={saveCase}
      />
    </div>
  )
}
