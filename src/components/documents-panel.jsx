import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Play,
  Square,
  X,
} from 'lucide-react'
import { cn } from 'cn'
import { AnswerCard } from '@/components/answer-card'
import { ConfidenceBadge } from '@/components/confidence-badge'
import { ErrorBanner } from '@/components/error-banner'
import { PreviewDialog, QuestionPreview } from '@/components/preview-dialog'
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
  ACCEPT,
  MAX_BATCH_FILES,
  MAX_FILE_BYTES,
  attachmentKind,
  isSupportedMimeType,
  readAsBase64,
  resolveMimeType,
} from '@/lib/attachments'
import {
  confidenceOf,
  createDecision,
  estimateCost,
  formatBytes,
  formatMs,
  formatPct,
  formatTokens,
  formatUsd,
  toApiQuestion,
} from '@/lib/decisions'
import { OCBC_FORM_TEMPLATE } from '@/lib/ocbc-form-template'

const LOW_CONFIDENCE = 0.6
const MAX_BATCH_TOTAL_BYTES = 100 * 1024 * 1024

const OCBC_QUESTIONS = Object.fromEntries(
  OCBC_FORM_TEMPLATE.questions.map((question) => [question.key, question]),
)
const DOCUMENT_PROMPT = 'Review the attached OCBC personal banking form.'

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function categoryOf(result) {
  return result.answers?.form_category?.choice ?? null
}

function actionOf(result) {
  return result.answers?.form_action?.choice ?? null
}

function isOcbcOf(result) {
  const probability = result.answers?.is_ocbc_form?.noul
  if (typeof probability !== 'number') return null
  return probability >= 0.5
}

function isFilledOf(result) {
  const probability = result.answers?.is_form_filled?.noul
  if (typeof probability !== 'number') return null
  return probability >= 0.5
}

function reviewConfidence(result) {
  const answers = [
    result.answers?.is_ocbc_form,
    result.answers?.is_form_filled,
    result.answers?.form_category,
    result.answers?.form_action,
  ]
    .map((answer) => confidenceOf(answer))
    .filter((value) => value > 0)

  return answers.length > 0 ? Math.min(...answers) : 0
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function Metric({ label, value, hint }) {
  return (
    <div className="bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-lg font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

function DocumentDetails({ result }) {
  return (
    <div className="space-y-3">
      {result.error ? <ErrorBanner error={result.error} /> : null}

      {result.answers ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {OCBC_FORM_TEMPLATE.questions.map((question) => (
            <AnswerCard
              key={question.key}
              id={question.key}
              question={question}
              answer={result.answers[question.key]}
            />
          ))}
        </div>
      ) : null}

      {result.response ? (
        <details className="text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground">
            Raw response
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-[11px]">
            {JSON.stringify(result.response, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

export function DocumentsPanel({ apiKey, hasKey, pushLog }) {
  const [files, setFiles] = useState([])
  const [fileError, setFileError] = useState(null)
  const [imageResolution, setImageResolution] = useState('low')
  const [dragging, setDragging] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(new Set())
  const [lowConfidenceOnly, setLowConfidenceOnly] = useState(false)
  const [concurrency, setConcurrency] = useState('3')
  const [statusById, setStatusById] = useState({})
  const [previewFile, setPreviewFile] = useState(null)
  const [copied, setCopied] = useState(null)

  const fileInputRef = useRef(null)
  const abortRef = useRef(null)
  const filesRef = useRef([])

  useEffect(() => {
    filesRef.current = files
  }, [files])

  useEffect(
    () => () => {
      for (const entry of filesRef.current) {
        if (entry.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(entry.previewUrl)
      }
    },
    [],
  )

  function revokePreview(entry) {
    if (entry?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(entry.previewUrl)
  }

  function removeFile(id) {
    const entry = files.find((candidate) => candidate.id === id)
    if (entry) revokePreview(entry)
    setFiles((current) => current.filter((candidate) => candidate.id !== id))
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList ?? [])
    if (incoming.length === 0) return

    setFileError(null)
    const current = filesRef.current
    const next = []
    const problems = []
    let totalBytes = current.reduce((sum, entry) => sum + entry.size, 0)

    for (const file of incoming) {
      if (current.length + next.length >= MAX_BATCH_FILES) {
        problems.push(`Limit is ${MAX_BATCH_FILES} files per run.`)
        break
      }

      const mimeType = resolveMimeType(file)
      if (!isSupportedMimeType(mimeType)) {
        problems.push(`${file.name}: use a PNG, JPEG, WebP, HEIC, GIF, BMP, TIFF, or PDF.`)
        continue
      }

      if (file.size > MAX_FILE_BYTES) {
        problems.push(`${file.name} is ${formatBytes(file.size)}. Keep each file under 15 MB.`)
        continue
      }

      totalBytes += file.size
      if (totalBytes > MAX_BATCH_TOTAL_BYTES) {
        problems.push('Selection is over 100 MB in total.')
        break
      }

      next.push({
        id: makeId(),
        file,
        name: file.name,
        mimeType,
        size: file.size,
        kind: attachmentKind(mimeType),
        previewUrl: URL.createObjectURL(file),
      })
    }

    if (next.length > 0) setFiles((previous) => [...previous, ...next])
    if (problems.length > 0) setFileError(problems.slice(0, 3).join(' '))
  }

  function handleDragOver(event) {
    event.preventDefault()
    if (!running) setDragging(true)
  }

  function handleDragLeave(event) {
    event.preventDefault()
    setDragging(false)
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    if (!running) addFiles(event.dataTransfer.files)
  }

  function toggleResult(id) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runDocuments() {
    if (files.length === 0 || running) return

    const runFiles = [...files]
    const apiQuestions = Object.fromEntries(
      OCBC_FORM_TEMPLATE.questions.map((question) => [
        question.key,
        toApiQuestion(question),
      ]),
    )
    const workerCount = Math.min(
      Math.max(1, Number(concurrency) || 1),
      runFiles.length,
    )

    setRunning(true)
    setError(null)
    setResults([])
    setExpanded(new Set())
    setStatusById(Object.fromEntries(runFiles.map((entry) => [entry.id, 'queued'])))
    setProgress({
      done: 0,
      total: runFiles.length,
      current: `Starting ${workerCount} parallel run${workerCount === 1 ? '' : 's'}…`,
    })

    const controller = new AbortController()
    abortRef.current = controller

    let nextIndex = 0
    let done = 0
    let stopped = false

    function reportProgress() {
      done += 1
      setProgress({
        done,
        total: runFiles.length,
        current: `${done} of ${runFiles.length} complete`,
      })
    }

    async function processFile(entry, index) {
      setStatusById((current) => ({ ...current, [entry.id]: 'running' }))

      try {
        const data = await readAsBase64(entry.file)

        const mediaBlock =
          entry.kind === 'document'
            ? { type: 'document', data, mime_type: entry.mimeType }
            : {
                type: 'image',
                data,
                mime_type: entry.mimeType,
                resolution: imageResolution,
              }

        const response = await createDecision({
          apiKey,
          input: [
            { type: 'text', text: `${DOCUMENT_PROMPT}\n` },
            mediaBlock,
          ],
          questions: apiQuestions,
          signal: controller.signal,
        })

        const result = {
          order: index,
          id: entry.id,
          name: entry.name,
          mimeType: entry.mimeType,
          kind: entry.kind,
          size: entry.size,
          ...response,
        }

        setResults((current) =>
          [...current, result].sort((a, b) => a.order - b.order),
        )
        setStatusById((current) => ({ ...current, [entry.id]: 'done' }))
        reportProgress()

        pushLog({
          kind: 'documents',
          label: entry.name,
          status: 'ok',
          ...response,
        })
      } catch (caught) {
        if (caught?.name === 'AbortError') {
          setStatusById((current) => ({ ...current, [entry.id]: 'cancelled' }))
          return
        }

        const fatal =
          caught?.code === 'missing_key' ||
          caught?.code === 'network' ||
          caught?.status === 401 ||
          caught?.status === 403 ||
          caught?.status === 429

        if (fatal) {
          stopped = true
          setStatusById((current) => ({ ...current, [entry.id]: 'error' }))
          setError(caught)
          pushLog({
            kind: 'documents',
            label: entry.name,
            status: 'error',
            error: caught,
          })
          controller.abort()
          return
        }

        const failed = {
          order: index,
          id: entry.id,
          name: entry.name,
          mimeType: entry.mimeType,
          kind: entry.kind,
          size: entry.size,
          answers: null,
          usage: {},
          elapsedMs: 0,
          request: null,
          response: null,
          error: {
            message: caught.message,
            code: caught.code,
            status: caught.status,
            details: caught.details,
          },
        }

        setResults((current) =>
          [...current, failed].sort((a, b) => a.order - b.order),
        )
        setStatusById((current) => ({ ...current, [entry.id]: 'error' }))
        reportProgress()
        setError(caught)

        pushLog({
          kind: 'documents',
          label: entry.name,
          status: 'error',
          error: caught,
        })
      }
    }

    async function worker() {
      while (!stopped && !controller.signal.aborted) {
        const index = nextIndex
        nextIndex += 1
        if (index >= runFiles.length) return
        await processFile(runFiles[index], index)
      }
    }

    try {
      await Promise.all(
        Array.from({ length: workerCount }, () => worker()),
      )
      setProgress({
        done,
        total: runFiles.length,
        current:
          done >= runFiles.length
            ? 'Complete'
            : controller.signal.aborted
              ? 'Stopped'
              : 'Stopped early',
      })
    } catch (caught) {
      if (caught?.name !== 'AbortError') {
        setError(caught)
        pushLog({
          kind: 'documents',
          label: 'Documents run',
          status: 'error',
          error: caught,
        })
      }
    } finally {
      setStatusById((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, status]) => [
            id,
            status === 'queued' || status === 'running' ? 'cancelled' : status,
          ]),
        ),
      )
      setRunning(false)
      abortRef.current = null
    }
  }

  const completed = useMemo(
    () => results.filter((result) => result.answers),
    [results],
  )

  const categoryCounts = useMemo(() => {
    const counts = new Map()
    for (const result of completed) {
      const category = categoryOf(result)
      if (!category) continue
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [completed])

  const lowConfidenceCount = completed.filter(
    (result) => reviewConfidence(result) < LOW_CONFIDENCE,
  ).length

  const filledCount = completed.filter((result) => isFilledOf(result) === true).length
  const notFilledCount = completed.filter((result) => isFilledOf(result) === false).length

  const meanCategoryConfidence =
    completed.length > 0
      ? completed.reduce(
          (sum, result) => sum + confidenceOf(result.answers?.form_category),
          0,
        ) / completed.length
      : 0

  const totalTokens = results.reduce(
    (sum, result) => sum + (result.usage?.total_input_tokens ?? 0),
    0,
  )
  const totalCost = results.reduce((sum, result) => sum + estimateCost(result.usage), 0)
  const failedCount = results.filter((result) => result.error).length

  const visibleResults = lowConfidenceOnly
    ? completed.filter((result) => reviewConfidence(result) < LOW_CONFIDENCE)
    : results

  async function copyCsv() {
    const header = [
      'file',
      'status',
      'category',
      'category_confidence',
      'action',
      'action_confidence',
      'is_ocbc_form',
      'is_ocbc_probability',
      'is_form_filled',
      'is_form_filled_probability',
      'review_confidence',
      'latency_ms',
      'input_tokens',
    ]

    const rows = results.map((result) => [
      result.name,
      result.error ? 'error' : 'done',
      categoryOf(result) ?? '',
      confidenceOf(result.answers?.form_category).toFixed(4),
      actionOf(result) ?? '',
      confidenceOf(result.answers?.form_action).toFixed(4),
      isOcbcOf(result) === null ? '' : isOcbcOf(result) ? 'yes' : 'no',
      typeof result.answers?.is_ocbc_form?.noul === 'number'
        ? result.answers.is_ocbc_form.noul.toFixed(4)
        : '',
      isFilledOf(result) === null ? '' : isFilledOf(result) ? 'yes' : 'no',
      typeof result.answers?.is_form_filled?.noul === 'number'
        ? result.answers.is_form_filled.noul.toFixed(4)
        : '',
      reviewConfidence(result).toFixed(4),
      result.elapsedMs,
      result.usage?.total_input_tokens ?? 0,
    ])

    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')

    try {
      await navigator.clipboard.writeText(csv)
      setCopied('csv')
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setError(new Error('Could not copy the CSV to the clipboard.'))
    }
  }

  async function copyJson() {
    const payload = {
      runAt: new Date().toISOString(),
      model: 'gemini-decision-1',
      template: 'OCBC form category',
      documents: results.map((result) => ({
        file: result.name,
        mimeType: result.mimeType,
        size: result.size,
        answers: result.answers,
        usage: result.usage,
        elapsedMs: result.elapsedMs,
        error: result.error,
      })),
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setCopied('json')
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setError(new Error('Could not copy the JSON to the clipboard.'))
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>OCBC form documents</CardTitle>
              <CardDescription>
                Each file is sent in its own request and reviewed for completion,
                category, and action. This is not a combined batch and has no
                ground-truth accuracy score.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono">
              OCBC form category
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {OCBC_FORM_TEMPLATE.questions.map((question) => (
              <Badge key={question.key} variant="outline" className="font-mono">
                {question.key} · {question.type}
              </Badge>
            ))}
            <Badge variant="secondary">$0.10 / 1M input</Badge>
            <Badge variant="secondary">0 output tokens</Badge>
          </div>

          <div
            className={cn(
              'rounded-xl border border-dashed p-4 transition-colors',
              dragging && 'border-foreground bg-muted/40',
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                aria-label="Attach OCBC forms"
                onChange={(event) => {
                  addFiles(event.target.files)
                  event.target.value = ''
                }}
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={running || files.length >= MAX_BATCH_FILES}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip />
                Attach PDFs or photos
              </Button>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Image detail</span>
                <Select
                  value={imageResolution}
                  onValueChange={setImageResolution}
                  disabled={running}
                >
                  <SelectTrigger className="h-7 w-24 text-xs" aria-label="Image resolution">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">low</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="high">high</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Parallel</span>
                <Select
                  value={concurrency}
                  onValueChange={setConcurrency}
                  disabled={running}
                >
                  <SelectTrigger className="h-7 w-16 text-xs" aria-label="Parallel requests">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <span className="text-[11px] text-muted-foreground">
                Up to {MAX_BATCH_FILES} files · 15 MB each · higher parallelism uses more quota
              </span>
            </div>

            {files.length > 0 ? (
              <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
                {files.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 rounded-lg border bg-card p-2"
                  >
                    {entry.kind === 'image' && entry.previewUrl ? (
                      <img
                        src={entry.previewUrl}
                        alt=""
                        className="size-9 shrink-0 rounded-md object-cover ring-1 ring-foreground/10"
                        onError={(event) => {
                          event.currentTarget.style.visibility = 'hidden'
                        }}
                      />
                    ) : (
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                        {entry.kind === 'document' ? (
                          <FileText className="size-4 text-muted-foreground" />
                        ) : (
                          <ImageIcon className="size-4 text-muted-foreground" />
                        )}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{entry.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {entry.kind === 'document' ? 'PDF' : 'Image'} ·{' '}
                        {formatBytes(entry.size)}
                        {statusById[entry.id] === 'queued' ? ' · queued' : ''}
                        {statusById[entry.id] === 'cancelled' ? ' · cancelled' : ''}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Preview ${entry.name}`}
                      onClick={() => setPreviewFile(entry)}
                    >
                      <Eye />
                    </Button>

                    {statusById[entry.id] === 'running' ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                    ) : null}
                    {statusById[entry.id] === 'done' ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                    ) : null}
                    {statusById[entry.id] === 'error' ? (
                      <AlertTriangle className="size-3.5 shrink-0 text-rose-500" />
                    ) : null}

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={running}
                      aria-label={`Remove ${entry.name}`}
                      onClick={() => removeFile(entry.id)}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            {fileError ? (
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{fileError}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={runDocuments}
              disabled={running || !hasKey || files.length === 0}
            >
              {running ? <Loader2 className="animate-spin" /> : <Play />}
              {running
                ? 'Running…'
                : `Run ${files.length} file${files.length === 1 ? '' : 's'}`}
            </Button>

            {running ? (
              <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                <Square />
                Cancel
              </Button>
            ) : null}

            {!hasKey ? (
              <span className="text-xs text-muted-foreground">
                Add a key above to run the documents.
              </span>
            ) : null}

            {files.length > 1 ? (
              <span className="text-xs text-muted-foreground">
                {files.length} separate requests ·{' '}
                {Math.min(Number(concurrency), files.length)} in parallel.
              </span>
            ) : null}
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

      {results.length > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border ring-1 ring-foreground/10 sm:grid-cols-3 lg:grid-cols-6">
            <Metric
              label="Documents"
              value={String(completed.length)}
              hint={
                failedCount > 0
                  ? `${filledCount} complete · ${failedCount} failed`
                  : `${filledCount} complete · ${notFilledCount} incomplete`
              }
            />
            <Metric
              label="Categories"
              value={String(categoryCounts.length)}
              hint="distinct results"
            />
            <Metric
              label="Low confidence"
              value={String(lowConfidenceCount)}
              hint="below 60%"
            />
            <Metric
              label="Mean confidence"
              value={meanCategoryConfidence.toFixed(2)}
              hint="category answer"
            />
            <Metric
              label="Input tokens"
              value={formatTokens(totalTokens)}
              hint="Output tokens: 0"
            />
            <Metric
              label="Estimated cost"
              value={formatUsd(totalCost)}
              hint="At $0.10 / 1M input"
            />
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>Per-document results</CardTitle>
                  <CardDescription>
                    Click a row for every probability. Each row came from a separate API request.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={lowConfidenceOnly ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setLowConfidenceOnly((current) => !current)}
                  >
                    Low confidence only
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyCsv}>
                    <Copy />
                    {copied === 'csv' ? 'Copied' : 'Copy CSV'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyJson}>
                    <Copy />
                    {copied === 'json' ? 'Copied' : 'Copy JSON'}
                  </Button>
                </div>
              </div>

              {categoryCounts.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {categoryCounts.map(([category, count]) => (
                    <Badge key={category} variant="secondary" className="font-mono">
                      {category} · {count}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardHeader>

            <CardContent>
              <div className="max-h-[36rem] overflow-auto rounded-xl border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Document</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>OCBC form</TableHead>
                      <TableHead>Form complete</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead className="text-right">Latency</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleResults.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={10}
                          className="h-24 text-center text-sm text-muted-foreground"
                        >
                          No documents match this filter.
                        </TableCell>
                      </TableRow>
                    ) : null}

                    {visibleResults.map((result) => {
                      const isOpen = expanded.has(result.id)
                      const category = categoryOf(result)
                      const action = actionOf(result)
                      const isOcbc = isOcbcOf(result)
                      const isFilled = isFilledOf(result)
                      const isBlocked = Boolean(result.error)

                      return (
                        <Fragment key={result.id}>
                          <TableRow
                            className="cursor-pointer"
                            onClick={() => toggleResult(result.id)}
                          >
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={isOpen ? 'Collapse' : 'Expand'}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  toggleResult(result.id)
                                }}
                              >
                                {isOpen ? <ChevronDown /> : <ChevronRight />}
                              </Button>
                            </TableCell>

                            <TableCell>
                              <div className="flex items-center gap-2">
                                {result.kind === 'document' ? (
                                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="max-w-[18rem] truncate font-medium">
                                  {result.name}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {result.kind === 'document' ? 'PDF' : 'Image'} ·{' '}
                                {formatBytes(result.size)}
                              </p>
                            </TableCell>

                            <TableCell>
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5 text-xs font-medium',
                                  isBlocked
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-emerald-600 dark:text-emerald-400',
                                )}
                              >
                                {isBlocked ? (
                                  <AlertTriangle className="size-3.5" />
                                ) : (
                                  <CheckCircle2 className="size-3.5" />
                                )}
                                {isBlocked ? 'Error' : 'Done'}
                              </span>
                            </TableCell>

                            <TableCell>
                              {category ? (
                                <div>
                                  <span className="font-mono text-xs">{category}</span>
                                  <p className="text-[11px] text-muted-foreground">
                                    {formatPct(
                                      confidenceOf(result.answers?.form_category),
                                      1,
                                    )}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>

                            <TableCell>
                              {action ? (
                                <div>
                                  <span className="font-mono text-xs">{action}</span>
                                  <p className="text-[11px] text-muted-foreground">
                                    {formatPct(
                                      confidenceOf(result.answers?.form_action),
                                      1,
                                    )}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>

                            <TableCell>
                              {isOcbc === null ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <div>
                                  <span className="text-xs">{isOcbc ? 'Yes' : 'No'}</span>
                                  <p className="text-[11px] text-muted-foreground">
                                    P(yes){' '}
                                    {formatPct(
                                      result.answers?.is_ocbc_form?.noul ?? 0,
                                      1,
                                    )}
                                  </p>
                                </div>
                              )}
                            </TableCell>

                            <TableCell>
                              {isFilled === null ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <div>
                                  <span className="text-xs">
                                    {isFilled ? 'Yes' : 'No'}
                                  </span>
                                  <p className="text-[11px] text-muted-foreground">
                                    P(yes){' '}
                                    {formatPct(
                                      result.answers?.is_form_filled?.noul ?? 0,
                                      1,
                                    )}
                                  </p>
                                </div>
                              )}
                            </TableCell>

                            <TableCell>
                              {isBlocked ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <ConfidenceBadge confidence={reviewConfidence(result)} />
                              )}
                            </TableCell>

                            <TableCell className="text-right tabular-nums">
                              {isBlocked ? '—' : formatMs(result.elapsedMs)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {isBlocked
                                ? '—'
                                : formatTokens(result.usage?.total_input_tokens ?? 0)}
                            </TableCell>
                          </TableRow>

                          {isOpen ? (
                            <TableRow>
                              <TableCell colSpan={10} className="bg-muted/30">
                                <DocumentDetails result={result} />
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
        </div>
      ) : null}

      <PreviewDialog
        open={Boolean(previewFile)}
        onOpenChange={(open) => {
          if (!open) setPreviewFile(null)
        }}
        title={previewFile?.name ?? 'Preview'}
        description={
          previewFile
            ? `${previewFile.kind === 'document' ? 'PDF' : 'Image'} · ${formatBytes(
                previewFile.size,
              )}`
            : null
        }
        footer={
          previewFile?.previewUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a href={previewFile.previewUrl} target="_blank" rel="noreferrer">
                <ExternalLink />
                Open in new tab
              </a>
            </Button>
          ) : null
        }
      >
        {previewFile ? (
          <div className="space-y-5">
            {previewFile.kind === 'image' && previewFile.previewUrl ? (
              <img
                src={previewFile.previewUrl}
                alt={previewFile.name}
                className="mx-auto max-h-[55vh] max-w-full rounded-lg object-contain ring-1 ring-foreground/10"
              />
            ) : null}

            {previewFile.kind === 'document' && previewFile.previewUrl ? (
              <div className="space-y-1">
                <object
                  data={previewFile.previewUrl}
                  type="application/pdf"
                  className="h-[55vh] w-full rounded-lg border bg-background"
                >
                  <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                    This browser cannot display the PDF inline. Use “Open in new tab”.
                  </div>
                </object>
                <p className="text-[11px] text-muted-foreground">
                  If the PDF preview is blank, open it in a new tab.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Text sent with the file</h3>
              <pre className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 font-mono text-[11px]">
                {DOCUMENT_PROMPT}
              </pre>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">Questions</h3>
              <QuestionPreview questions={OCBC_QUESTIONS} />
            </div>
          </div>
        ) : null}
      </PreviewDialog>
    </div>
  )
}
