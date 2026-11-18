import { Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `q-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function uniqueKey(questions) {
  const existing = new Set(questions.map((question) => question.key))
  let index = questions.length + 1
  while (existing.has(`question_${index}`)) index += 1
  return `question_${index}`
}

function defaultCriteria(type) {
  if (type === 'noul') return { true_description: '', false_description: '' }
  if (type === 'choice') return { option_a: '', option_b: '' }
  return ['Level 1', 'Level 2']
}

function NoulCriteria({ question, onChange }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">True means (optional)</Label>
        <Input
          className="h-8 text-xs"
          value={question.criteria?.true_description ?? ''}
          placeholder="The condition holds when…"
          onChange={(event) =>
            onChange({
              ...question.criteria,
              true_description: event.target.value,
            })
          }
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">False means (optional)</Label>
        <Input
          className="h-8 text-xs"
          value={question.criteria?.false_description ?? ''}
          placeholder="The condition does not hold when…"
          onChange={(event) =>
            onChange({
              ...question.criteria,
              false_description: event.target.value,
            })
          }
        />
      </div>
    </div>
  )
}

function ChoiceCriteria({ question, onChange }) {
  const entries = Object.entries(question.criteria ?? {})

  function rename(oldKey, newKey) {
    const next = {}
    for (const [key, value] of entries) next[key === oldKey ? newKey : key] = value
    onChange(next)
  }

  function describe(key, description) {
    onChange({ ...question.criteria, [key]: description })
  }

  function remove(key) {
    if (entries.length <= 2) return
    const next = { ...question.criteria }
    delete next[key]
    onChange(next)
  }

  function add() {
    const keys = new Set(entries.map(([key]) => key))
    let index = entries.length + 1
    while (keys.has(`option_${index}`)) index += 1
    onChange({ ...question.criteria, [`option_${index}`]: '' })
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, description], index) => (
        // Key by position so renaming an option keeps focus stable.
        <div key={index} className="flex items-center gap-2">
          <Input
            className="h-8 w-40 font-mono text-xs"
            value={key}
            aria-label={`Option ${index + 1} key`}
            onChange={(event) => rename(key, event.target.value)}
          />
          <Input
            className="h-8 flex-1 text-xs"
            value={description}
            placeholder="When does this option apply?"
            onChange={(event) => describe(key, event.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={entries.length <= 2}
            aria-label={`Remove option ${index + 1}`}
            onClick={() => remove(key)}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="xs" onClick={add}>
        <Plus />
        Add option
      </Button>
    </div>
  )
}

function ScoreCriteria({ question, onChange }) {
  const levels = question.criteria ?? []

  function update(index, value) {
    onChange(levels.map((level, levelIndex) => (levelIndex === index ? value : level)))
  }

  function remove(index) {
    if (levels.length <= 2) return
    onChange(levels.filter((_, levelIndex) => levelIndex !== index))
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Ordered lowest to highest. The API scores by level index.</p>
      {levels.map((level, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="w-4 text-right font-mono text-xs text-muted-foreground">{index}</span>
          <Input
            className="h-8 flex-1 text-xs"
            value={level}
            aria-label={`Level ${index}`}
            onChange={(event) => update(index, event.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={levels.length <= 2}
            aria-label={`Remove level ${index}`}
            onClick={() => remove(index)}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={levels.length >= 10}
        onClick={() => onChange([...levels, `Level ${levels.length + 1}`])}
      >
        <Plus />
        Add level
      </Button>
    </div>
  )
}

export function QuestionEditor({ questions, onChange }) {
  function update(id, patch) {
    onChange(questions.map((question) => (question.id === id ? { ...question, ...patch } : question)))
  }

  function remove(id) {
    onChange(questions.filter((question) => question.id !== id))
  }

  function add() {
    onChange([
      ...questions,
      {
        id: makeId(),
        key: uniqueKey(questions),
        type: 'noul',
        instructions: '',
        criteria: defaultCriteria('noul'),
      },
    ])
  }

  return (
    <div className="space-y-3">
      {questions.map((question, index) => (
        <div key={question.id} className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Q{index + 1}</span>

            <Input
              className="h-8 w-44 font-mono text-xs"
              value={question.key}
              aria-label={`Question ${index + 1} key`}
              onChange={(event) => update(question.id, { key: event.target.value })}
            />

            <Select
              value={question.type}
              onValueChange={(type) =>
                update(question.id, { type, criteria: defaultCriteria(type) })
              }
            >
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="noul">noul</SelectItem>
                <SelectItem value="choice">choice</SelectItem>
                <SelectItem value="score">score</SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              aria-label={`Remove question ${index + 1}`}
              onClick={() => remove(question.id)}
            >
              <Trash2 />
            </Button>
          </div>

          <div className="mt-3 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Instructions</Label>
            <Textarea
              rows={2}
              className="min-h-0 text-sm"
              value={question.instructions}
              placeholder="Write the full question. The model never sees the question key."
              onChange={(event) => update(question.id, { instructions: event.target.value })}
            />
          </div>

          <div className="mt-3">
            {question.type === 'noul' ? (
              <NoulCriteria
                question={question}
                onChange={(criteria) => update(question.id, { criteria })}
              />
            ) : null}
            {question.type === 'choice' ? (
              <ChoiceCriteria
                question={question}
                onChange={(criteria) => update(question.id, { criteria })}
              />
            ) : null}
            {question.type === 'score' ? (
              <ScoreCriteria
                question={question}
                onChange={(criteria) => update(question.id, { criteria })}
              />
            ) : null}
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus />
        Add question
      </Button>
    </div>
  )
}
