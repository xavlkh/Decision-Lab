import { useMemo, useRef, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MediaThumbnail } from '@/components/media-preview'
import {
  ACCEPT,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  attachmentKind,
  isSupportedMimeType,
  resolveMimeType,
} from '@/lib/attachments'
import { QUESTION_PRESETS, answerOptions, expectedLabel } from '@/lib/benchmark'
import { analyzeMockDb, mockDbExpected } from '@/lib/mock-db'
import { formatBytes } from '@/lib/decisions'

function newCaseId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `custom-${crypto.randomUUID()}`
  }
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function CustomCaseDialog({ open, onOpenChange, caseDef, onSave }) {
  const [title, setTitle] = useState(caseDef?.title ?? '')
  const [tag, setTag] = useState(caseDef?.tag ?? 'Custom')
  const [state, setState] = useState(caseDef?.state ?? '')
  const [presetId, setPresetId] = useState(
    caseDef?.presetId && QUESTION_PRESETS[caseDef.presetId] ? caseDef.presetId : 'triage',
  )
  const [expected, setExpected] = useState(caseDef?.expected ?? {})
  const [dbLookupKey, setDbLookupKey] = useState(caseDef?.dbLookupKey ?? '')
  const [media, setMedia] = useState(caseDef?.media ?? [])
  const [fileError, setFileError] = useState(null)
  const fileInputRef = useRef(null)

  const preset = QUESTION_PRESETS[presetId]
  const questions = preset.questions
  const baseQuestions = Object.fromEntries(
    Object.entries(questions).filter(([, question]) => !question.requiresDb),
  )
  const dbQuestions = Object.fromEntries(
    Object.entries(questions).filter(([, question]) => question.requiresDb),
  )
  const isOcbc = presetId === 'ocbc_form'
  const activeDbKey = isOcbc ? dbLookupKey.trim() : ''
  const dbAnalysis = useMemo(
    () => (activeDbKey ? analyzeMockDb(activeDbKey, state) : null),
    [activeDbKey, state],
  )
  const dbExpected = useMemo(() => mockDbExpected(dbAnalysis), [dbAnalysis])
  const missing = Object.keys(baseQuestions).filter((id) => expected[id] === undefined)
  const hasInput = state.trim().length > 0 || media.length > 0
  const dbKeyValid = !activeDbKey || Boolean(dbAnalysis?.lookupAttempted)
  const canSave =
    title.trim().length > 0 && hasInput && missing.length === 0 && dbKeyValid
  const totalBytes = media.reduce((sum, item) => sum + item.size, 0)

  function handleAddFiles(event) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (picked.length === 0) return

    const messages = []
    const accepted = []
    const seen = new Set(media.map((item) => `${item.name}:${item.size}:${item.file?.lastModified}`))
    let total = totalBytes

    for (const file of picked) {
      const mimeType = resolveMimeType(file)
      const signature = `${file.name}:${file.size}:${file.lastModified}`

      if (media.length + accepted.length >= MAX_FILES) {
        messages.push(`Up to ${MAX_FILES} files per case.`)
        break
      }
      if (!isSupportedMimeType(mimeType)) {
        messages.push(`${file.name} is not a supported image or PDF.`)
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        messages.push(`${file.name} is larger than 15 MB.`)
        continue
      }
      if (total + file.size > MAX_TOTAL_BYTES) {
        messages.push(`${file.name} would push the files over 30 MB.`)
        continue
      }
      if (seen.has(signature)) {
        messages.push(`${file.name} is already attached.`)
        continue
      }

      seen.add(signature)
      total += file.size
      accepted.push({
        file,
        name: file.name,
        mimeType,
        kind: attachmentKind(mimeType),
        size: file.size,
      })
    }

    if (accepted.length > 0) {
      setMedia((current) => [...current, ...accepted])
      setFileError(null)
    }
    if (messages.length > 0) setFileError(messages.join(' '))
  }

  function removeFile(index) {
    setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))
    setFileError(null)
  }

  function changePreset(next) {
    setPresetId(next)
    setExpected({})
  }

  function setAnswer(id, question, value) {
    const parsed =
      question.type === 'noul'
        ? value === 'true'
        : question.type === 'score'
          ? Number(value)
          : value
    setExpected((current) => ({ ...current, [id]: parsed }))
  }

  function handleSave() {
    if (!canSave) return

    const baseExpected = Object.fromEntries(
      Object.keys(baseQuestions)
        .filter((id) => expected[id] !== undefined)
        .map((id) => [id, expected[id]]),
    )

    onSave({
      id: caseDef?.id ?? newCaseId(),
      custom: true,
      title: title.trim(),
      tag: tag.trim() || 'Custom',
      state: state.trim(),
      presetId,
      dbLookupKey: activeDbKey,
      expected: baseExpected,
      media,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{caseDef ? 'Edit benchmark case' : 'Add benchmark case'}</DialogTitle>
          <DialogDescription>
            Give the case an input and the answers you expect. Text, photos, and PDFs are
            supported.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-5 overflow-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="custom-case-title">Title</Label>
              <Input
                id="custom-case-title"
                value={title}
                maxLength={120}
                placeholder="e.g. OCBC credit card limit form"
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-case-tag">Tag</Label>
              <Input
                id="custom-case-tag"
                value={tag}
                maxLength={40}
                placeholder="Custom"
                onChange={(event) => setTag(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="custom-case-input">Input text</Label>
            <Textarea
              id="custom-case-input"
              rows={4}
              value={state}
              placeholder="Paste the message, form text, or a short description of the attachment."
              onChange={(event) => setState(event.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Optional if you attach a file. This text is sent before the media.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Attachments</Label>
              <span className="text-[11px] text-muted-foreground">
                {media.length}/{MAX_FILES} files · {formatBytes(totalBytes)} / 30 MB
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={handleAddFiles}
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={media.length >= MAX_FILES}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip />
              Attach photo or PDF
            </Button>

            {media.length > 0 ? (
              <div className="space-y-2">
                {media.map((item, index) => (
                  <MediaThumbnail
                    key={`${item.name}-${item.size}-${index}`}
                    item={item}
                    onRemove={() => removeFile(index)}
                  />
                ))}
              </div>
            ) : null}

            {fileError ? (
              <p className="text-xs text-rose-600 dark:text-rose-400">{fileError}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Question set</Label>
            <Select value={presetId} onValueChange={changePreset}>
              <SelectTrigger className="w-full sm:w-72" aria-label="Question set">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(QUESTION_PRESETS).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{preset.description}</p>
          </div>

          {isOcbc ? (
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="custom-case-db-key">Mock DB lookup key (optional)</Label>
                <Input
                  id="custom-case-db-key"
                  value={dbLookupKey}
                  onChange={(event) => setDbLookupKey(event.target.value)}
                  placeholder="CUST-1001, NRIC/FIN, or email"
                />
                <p className="text-[11px] text-muted-foreground">
                  Adds customer_exists, form_accurate, and mismatched_field. Ground truth
                  is computed from the current mock DB and the input text.
                </p>
              </div>

              {activeDbKey ? (
                <div className="space-y-1.5 text-[11px]">
                  {dbAnalysis?.customer ? (
                    <p className="text-emerald-600 dark:text-emerald-400">
                      Found {dbAnalysis.customer.customer_id} ·{' '}
                      {dbAnalysis.customer.name}
                    </p>
                  ) : dbAnalysis?.lookupAttempted ? (
                    <p className="text-rose-600 dark:text-rose-400">
                      No customer matched “{activeDbKey}”.
                    </p>
                  ) : (
                    <p className="text-amber-600 dark:text-amber-400">
                      Key not recognized. Use a customer ID, NRIC/FIN, or email.
                    </p>
                  )}

                  {dbAnalysis?.comparison ? (
                    <p className="text-muted-foreground">
                      {dbAnalysis.comparison.comparedFields.length} form fields compared ·{' '}
                      {dbAnalysis.comparison.mismatches.length === 0
                        ? 'all match'
                        : `${dbAnalysis.comparison.mismatches.length} mismatch${
                            dbAnalysis.comparison.mismatches.length === 1 ? '' : 'es'
                          }`}
                    </p>
                  ) : dbAnalysis?.customer ? (
                    <p className="text-muted-foreground">
                      No comparable form fields in the text input, so only customer_exists
                      will be scored.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {Object.entries(dbQuestions).map(([id, question]) => {
                      const value = dbExpected[id]
                      return (
                        <Badge
                          key={id}
                          variant={value === undefined ? 'outline' : 'secondary'}
                        >
                          {id}{' '}
                          {value === undefined
                            ? 'not scored'
                            : expectedLabel(question, value)}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Leave blank to run only the standard OCBC questions.
                </p>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Expected answers</Label>
              {missing.length > 0 ? (
                <span className="text-[11px] text-muted-foreground">
                  {missing.length} still to choose
                </span>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(baseQuestions).map(([id, question]) => (
                <div key={id} className="space-y-1.5 rounded-lg border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-medium">{id}</span>
                    <Badge variant="outline" className="uppercase">
                      {question.type}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{question.instructions}</p>

                  <Select
                    value={expected[id] === undefined ? '' : String(expected[id])}
                    onValueChange={(value) => setAnswer(id, question, value)}
                  >
                    <SelectTrigger className="w-full" aria-label={`Expected ${id}`}>
                      <SelectValue placeholder="Choose the expected answer" />
                    </SelectTrigger>
                    <SelectContent>
                      {answerOptions(question).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave}>
            {caseDef ? 'Save changes' : 'Add case'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
