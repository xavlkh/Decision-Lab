import { useEffect, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Loader2, Paperclip, Play, Square, X } from 'lucide-react'
import { cn } from 'cn'
import { AnswerCard } from '@/components/answer-card'
import { ErrorBanner } from '@/components/error-banner'
import { QuestionEditor } from '@/components/question-editor'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  createDecision,
  estimateCost,
  formatBytes,
  formatMs,
  formatTokens,
  formatUsd,
  toApiQuestion,
  validateQuestions,
} from '@/lib/decisions'
import { OCBC_FORM_TEMPLATE } from '@/lib/ocbc-form-template'
import {
  ACCEPT,
  IMAGE_MIME_TYPES,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  readAsBase64,
  resolveMimeType,
} from '@/lib/attachments'

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `q-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const PRESETS = [
  OCBC_FORM_TEMPLATE,
  {
    id: 'card-dispute',
    name: 'Card dispute',
    input:
      'I was charged twice for the same coffee order yesterday. The amount is $18.40 and it appears twice on my card statement.',
    questions: [
      {
        key: 'is_refund_request',
        type: 'noul',
        instructions: 'Is the customer asking for money back?',
        criteria: {
          true_description: 'A charge should be reversed or money returned.',
          false_description: 'No money needs to be returned.',
        },
      },
      {
        key: 'department',
        type: 'choice',
        instructions: 'Which team should handle this request?',
        criteria: {
          card_disputes: 'Card charges, refunds, and fee waivers.',
          fraud: 'Unauthorised transactions or account takeover.',
          general: 'Anything else.',
        },
      },
      {
        key: 'urgency',
        type: 'score',
        instructions: 'How urgent is this request?',
        criteria: ['Routine', 'Needs a response today', 'Urgent', 'Critical'],
      },
    ],
  },
  {
    id: 'damaged-item',
    name: 'Damaged item',
    input:
      'The blue mug I ordered on Monday arrived cracked on Wednesday. I want a replacement, or my money back.',
    questions: [
      {
        key: 'is_damaged',
        type: 'noul',
        instructions: 'Did the item arrive damaged?',
        criteria: {
          true_description: 'The item arrived broken, cracked, or faulty.',
          false_description: 'The item arrived in usable condition.',
        },
      },
      {
        key: 'resolution',
        type: 'choice',
        instructions: 'What resolution fits this request?',
        criteria: {
          replacement: 'Ship a replacement item.',
          refund: 'Refund the order instead of replacing it.',
          troubleshooting: 'The issue may be fixable first.',
          other: 'Anything outside these options.',
        },
      },
      {
        key: 'severity',
        type: 'score',
        instructions: 'How severe is the problem?',
        criteria: ['Cosmetic only', 'Usable with a workaround', 'Fully blocked'],
      },
    ],
  },
  {
    id: 'loan-enquiry',
    name: 'Loan enquiry',
    input:
      'I applied for a home loan eleven days ago and still have not heard back. Can you check the status?',
    questions: [
      {
        key: 'is_status_request',
        type: 'noul',
        instructions: 'Is the customer asking for a status update rather than starting a new application?',
        criteria: {
          true_description: 'The customer only wants an update on an existing application.',
          false_description: 'The customer wants to apply or change something.',
        },
      },
      {
        key: 'team',
        type: 'choice',
        instructions: 'Which team should handle this request?',
        criteria: {
          loans: 'Loan applications and repayments.',
          general: 'Anything else.',
        },
      },
      {
        key: 'urgency',
        type: 'score',
        instructions: 'How urgent is this request?',
        criteria: ['Routine', 'Needs a response today', 'Urgent', 'Critical'],
      },
    ],
  },
  {
    id: 'photo-check',
    name: 'Photo check',
    input: 'Review the attached photo for a support claim.',
    questions: [
      {
        key: 'visible_damage',
        type: 'noul',
        instructions: 'Does the attached photo show physical damage or a defect?',
        criteria: {
          true_description: 'Something is broken, cracked, or visibly faulty.',
          false_description: 'The item looks intact, or the photo is unrelated.',
        },
      },
      {
        key: 'subject',
        type: 'choice',
        instructions: 'What is the main subject of the attached photo?',
        criteria: {
          product: 'A product or item.',
          document: 'A document, label, or receipt.',
          scene: 'A room, street, or outdoor scene.',
          other: 'Anything else.',
        },
      },
      {
        key: 'severity',
        type: 'score',
        instructions: 'How severe is the visible issue?',
        criteria: ['None', 'Minor', 'Major', 'Severe'],
      },
    ],
  },
  {
    id: 'document-check',
    name: 'Document check',
    input: 'Review the attached PDF.',
    questions: [
      {
        key: 'has_total',
        type: 'noul',
        instructions: 'Does the attached document show a total amount or amount due?',
        criteria: {
          true_description: 'There is a total, balance, or amount payable.',
          false_description: 'There is no total or amount payable.',
        },
      },
      {
        key: 'document_type',
        type: 'choice',
        instructions: 'What kind of document is attached?',
        criteria: {
          invoice: 'Invoice or bill.',
          receipt: 'Receipt or proof of payment.',
          form: 'Form or application.',
          letter: 'Letter or notice.',
          other: 'Anything else.',
        },
      },
      {
        key: 'needs_action',
        type: 'noul',
        instructions: 'Does the document ask the reader to take an action?',
        criteria: {
          true_description: 'It asks for a payment, signature, reply, or other action.',
          false_description: 'It is informational only.',
        },
      },
    ],
  },
  {
    id: 'vision-check',
    name: 'Vision check',
    input: 'Inspect the attached image.',
    questions: [
      {
        key: 'is_circle',
        type: 'noul',
        instructions: 'Is the dominant shape in the image a circle?',
        criteria: {
          true_description: 'The main object is round or circular.',
          false_description: 'The main object is not circular.',
        },
      },
      {
        key: 'dominant_color',
        type: 'choice',
        instructions: 'What is the dominant colour in the image?',
        criteria: {
          red: 'Mostly red.',
          blue: 'Mostly blue.',
          green: 'Mostly green.',
          other: 'Another colour or a mix.',
        },
      },
      {
        key: 'shape_count',
        type: 'score',
        instructions: 'How many distinct shapes are visible?',
        criteria: ['None', 'One', 'Two', 'Three or more'],
      },
    ],
  },
]

function buildQuestions(preset) {
  return preset.questions.map((question) => ({
    ...question,
    id: makeId(),
    criteria: JSON.parse(JSON.stringify(question.criteria)),
  }))
}

function ResultMetrics({ result }) {
  const usage = result.usage ?? {}
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
      <span className="tabular-nums">{formatTokens(usage.total_input_tokens)} input tokens</span>
      <span>0 output tokens</span>
      <span className="tabular-nums">{formatUsd(estimateCost(usage))}</span>
      <span className="tabular-nums">{formatMs(result.elapsedMs)}</span>
    </div>
  )
}

export function PlaygroundPanel({ apiKey, hasKey, pushLog }) {
  const [input, setInput] = useState(PRESETS[0].input)
  const [questions, setQuestions] = useState(() => buildQuestions(PRESETS[0]))
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [attachmentError, setAttachmentError] = useState(null)
  const [readingFiles, setReadingFiles] = useState(false)
  const [imageResolution, setImageResolution] = useState('low')
  const [dragging, setDragging] = useState(false)

  const abortRef = useRef(null)
  const fileInputRef = useRef(null)
  const attachmentsRef = useRef([])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(
    () => () => {
      for (const attachment of attachmentsRef.current) {
        if (attachment.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(attachment.previewUrl)
        }
      }
    },
    [],
  )

  function revokePreview(attachment) {
    if (attachment?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(attachment.previewUrl)
  }

  function clearAttachments() {
    for (const attachment of attachmentsRef.current) revokePreview(attachment)
    setAttachments([])
    setAttachmentError(null)
  }

  function loadPreset(presetId) {
    const preset = PRESETS.find((candidate) => candidate.id === presetId)
    if (!preset) return
    clearAttachments()
    setInput(preset.input)
    setQuestions(buildQuestions(preset))
    setResult(null)
    setError(null)
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return

    setAttachmentError(null)

    const current = attachmentsRef.current
    if (current.length + files.length > MAX_FILES) {
      setAttachmentError(`Attach at most ${MAX_FILES} files per request.`)
      return
    }

    setReadingFiles(true)
    const incoming = []

    try {
      let totalBytes = current.reduce((sum, attachment) => sum + attachment.size, 0)

      for (const file of files) {
        const mimeType = resolveMimeType(file)
        if (!IMAGE_MIME_TYPES.has(mimeType) && mimeType !== 'application/pdf') {
          throw new Error(`${file.name}: attach a PNG, JPEG, WebP, HEIC, GIF, BMP, TIFF, or PDF.`)
        }

        if (file.size > MAX_FILE_BYTES) {
          throw new Error(`${file.name} is ${formatBytes(file.size)}. Keep each file under 15 MB.`)
        }

        totalBytes += file.size
        if (totalBytes > MAX_TOTAL_BYTES) {
          throw new Error('Attachments are over 30 MB in total. Remove one or use a smaller file.')
        }

        const data = await readAsBase64(file)
        incoming.push({
          id: makeId(),
          name: file.name,
          mimeType,
          size: file.size,
          kind: mimeType === 'application/pdf' ? 'document' : 'image',
          data,
          previewUrl: mimeType.startsWith('image/') ? URL.createObjectURL(file) : null,
        })
      }

      setAttachments((previous) => [...previous, ...incoming])
    } catch (caught) {
      for (const attachment of incoming) revokePreview(attachment)
      setAttachmentError(caught.message)
    } finally {
      setReadingFiles(false)
    }
  }

  function removeAttachment(id) {
    const attachment = attachments.find((candidate) => candidate.id === id)
    if (attachment) revokePreview(attachment)
    setAttachments((current) => current.filter((candidate) => candidate.id !== id))
  }

  function handleDragOver(event) {
    event.preventDefault()
    if (!running && !readingFiles) setDragging(true)
  }

  function handleDragLeave(event) {
    event.preventDefault()
    setDragging(false)
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    if (!running && !readingFiles) addFiles(event.dataTransfer.files)
  }

  async function run() {
    setError(null)
    setResult(null)

    const keys = questions.map((question) => question.key.trim())
    if (new Set(keys).size !== keys.length) {
      setError('Question keys must be unique.')
      return
    }

    const apiQuestions = {}
    for (const question of questions) {
      apiQuestions[question.key.trim()] = toApiQuestion(question)
    }

    const validationError = validateQuestions(apiQuestions)
    if (validationError) {
      setError(validationError)
      return
    }

    const blocks = []
    if (input.trim()) {
      blocks.push({ type: 'text', text: attachments.length > 0 ? `${input}\n` : input })
    }

    for (const attachment of attachments) {
      if (attachment.kind === 'image') {
        blocks.push({
          type: 'image',
          data: attachment.data,
          mime_type: attachment.mimeType,
          resolution: imageResolution,
        })
      } else {
        blocks.push({
          type: 'document',
          data: attachment.data,
          mime_type: attachment.mimeType,
        })
      }
    }

    const inputPayload = attachments.length > 0 ? blocks : input

    setRunning(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await createDecision({
        apiKey,
        input: inputPayload,
        questions: apiQuestions,
        signal: controller.signal,
      })
      setResult({ ...response, questions: apiQuestions, hasMedia: attachments.length > 0 })
      pushLog({
        kind: 'playground',
        label: `Playground · ${Object.keys(apiQuestions).length} questions`,
        status: 'ok',
        ...response,
      })
    } catch (caught) {
      if (caught?.name === 'AbortError') return
      setError(caught)
      pushLog({
        kind: 'playground',
        label: 'Playground request',
        status: 'error',
        error: caught,
      })
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  const answerEntries = result ? Object.entries(result.answers) : []
  const totalAttachmentBytes = attachments.reduce((sum, attachment) => sum + attachment.size, 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Shared input</CardTitle>
                <CardDescription>
                  One input, plus optional photos or PDFs, is scored against every question in a
                  single request.
                </CardDescription>
              </div>
              <Select onValueChange={loadPreset}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Load example" />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={cn(
                'space-y-3 rounded-xl transition-shadow',
                dragging && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="space-y-1.5">
                <Label htmlFor="decision-input" className="text-xs text-muted-foreground">
                  Customer message, document text, or JSON
                </Label>
                <Textarea
                  id="decision-input"
                  rows={9}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Paste the text the model should judge, or attach a photo or PDF…"
                  className="min-h-40 resize-y"
                />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                aria-label="Attach photos or PDFs"
                onChange={(event) => {
                  addFiles(event.target.files)
                  event.target.value = ''
                }}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={running || readingFiles || attachments.length >= MAX_FILES}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {readingFiles ? <Loader2 className="animate-spin" /> : <Paperclip />}
                  {readingFiles ? 'Reading…' : 'Attach photo or PDF'}
                </Button>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Image detail</span>
                  <Select value={imageResolution} onValueChange={setImageResolution}>
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

                <span className="text-[11px] text-muted-foreground">
                  Up to {MAX_FILES} files · 15 MB each ·{' '}
                  {attachments.length > 0 ? formatBytes(totalAttachmentBytes) : 'PNG, JPEG, PDF'}
                </span>
              </div>

              {attachments.length > 0 ? (
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2"
                    >
                      {attachment.kind === 'image' && attachment.previewUrl ? (
                        <img
                          src={attachment.previewUrl}
                          alt=""
                          className="size-10 shrink-0 rounded-md object-cover ring-1 ring-foreground/10"
                          onError={(event) => {
                            event.currentTarget.style.visibility = 'hidden'
                          }}
                        />
                      ) : (
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                          {attachment.kind === 'document' ? (
                            <FileText className="size-4 text-muted-foreground" />
                          ) : (
                            <ImageIcon className="size-4 text-muted-foreground" />
                          )}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{attachment.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {attachment.kind === 'document' ? 'PDF' : 'Image'} ·{' '}
                          {formatBytes(attachment.size)}
                          {attachment.kind === 'image' ? ` · ${imageResolution} detail` : ''}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${attachment.name}`}
                        onClick={() => removeAttachment(attachment.id)}
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              {attachmentError ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">{attachmentError}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={run}
                disabled={running || !hasKey || readingFiles}
              >
                <Play />
                {running ? 'Running…' : 'Run decision'}
              </Button>
              {running ? (
                <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                  <Square />
                  Cancel
                </Button>
              ) : null}
              {!hasKey ? (
                <span className="text-xs text-muted-foreground">
                  Add a key above to run the request.
                </span>
              ) : null}
              {result ? (
                <span className="text-xs text-muted-foreground">
                  {answerEntries.length} answers · {formatMs(result.elapsedMs)}
                </span>
              ) : null}
            </div>

            {error ? <ErrorBanner error={error} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
            <CardDescription>
              noul returns P(yes). choice returns one option plus probabilities. score returns a
              weighted level. Question keys are for your code, not the model.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {questions.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                No questions yet. Add one below.
              </p>
            ) : null}
            <QuestionEditor questions={questions} onChange={setQuestions} />
          </CardContent>
        </Card>
      </div>

      {result ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-heading text-base font-medium">Answers</h2>
              <p className="text-xs text-muted-foreground">
                Calibrated probabilities, not generated text.
              </p>
            </div>
            <ResultMetrics result={result} />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {answerEntries.map(([id, answer]) => (
              <AnswerCard key={id} id={id} question={result.questions[id]} answer={answer} />
            ))}
          </div>

          <details className="rounded-xl border bg-card p-4 text-sm">
            <summary className="cursor-pointer select-none font-medium">Raw response</summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Request</p>
                <pre className="max-h-80 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-[11px]">
                  {JSON.stringify(result.request, null, 2)}
                </pre>
                {result.hasMedia ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Attached media is omitted from this preview and the request log.
                  </p>
                ) : null}
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Response</p>
                <pre className="max-h-80 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-[11px]">
                  {JSON.stringify(result.response, null, 2)}
                </pre>
              </div>
            </div>
          </details>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
          <p className="font-heading text-sm font-medium">No decision yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Run the example to see calibrated probabilities for each question. Nothing is generated
            as text, so there is no output-token charge.
          </p>
        </div>
      )}
    </div>
  )
}
