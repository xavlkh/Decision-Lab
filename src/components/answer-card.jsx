import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { confidenceOf, formatPct, topLevel } from '@/lib/decisions'
import { ConfidenceBadge } from './confidence-badge'
import { ProbabilityBar } from './probability-bar'

function NoulAnswer({ answer }) {
  const pYes = typeof answer.noul === 'number' ? answer.noul : 0
  const pNo = 1 - pYes

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="font-heading text-3xl font-semibold tabular-nums">{formatPct(pYes, 1)}</div>
          <div className="text-xs text-muted-foreground">probability of yes</div>
        </div>
        <Badge variant={pYes >= 0.5 ? 'default' : 'secondary'}>{pYes >= 0.5 ? 'YES' : 'NO'}</Badge>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium">Yes</span>
          <span className="tabular-nums">{formatPct(pYes, 1)}</span>
        </div>
        <ProbabilityBar value={pYes} tone="bg-foreground" />
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span>No</span>
          <span className="tabular-nums">{formatPct(pNo, 1)}</span>
        </div>
        <ProbabilityBar value={pNo} tone="bg-foreground/25" />
      </div>
    </div>
  )
}

function ChoiceAnswer({ question, answer }) {
  const chosen = answer.choice
  const entries = Object.entries(answer.probabilities ?? {}).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-4">
      <div>
        <div className="font-mono text-2xl font-semibold">{chosen ?? '—'}</div>
        {question.criteria?.[chosen] ? (
          <p className="mt-1 text-xs text-muted-foreground">{question.criteria[chosen]}</p>
        ) : null}
      </div>

      <div className="space-y-2.5">
        {entries.map(([key, probability]) => {
          const isChosen = key === chosen
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className={isChosen ? 'font-medium' : 'text-muted-foreground'}>{key}</span>
                <span className="tabular-nums">{formatPct(probability, 1)}</span>
              </div>
              <ProbabilityBar
                value={probability}
                tone={isChosen ? 'bg-foreground' : 'bg-foreground/20'}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScoreAnswer({ answer }) {
  const top = topLevel(answer)
  const levels = Object.entries(answer.probabilities ?? {}).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  )
  const maxLevel = Math.max(0, levels.length - 1)

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="font-heading text-3xl font-semibold tabular-nums">
            {typeof answer.score === 'number' ? answer.score.toFixed(2) : '—'}
          </div>
          <div className="text-xs text-muted-foreground">expected score</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>out of {maxLevel}</div>
          {top ? <div className="mt-1 font-medium text-foreground">level {top.index} is most likely</div> : null}
        </div>
      </div>

      <div className="space-y-2">
        {levels.map(([index, probability]) => {
          const isTop = top && Number(index) === top.index
          return (
            <div key={index} className="grid grid-cols-[1.25rem_1fr_2.75rem] items-center gap-2">
              <span className={isTop ? 'text-xs font-semibold tabular-nums' : 'text-xs text-muted-foreground tabular-nums'}>
                {index}
              </span>
              <ProbabilityBar
                value={probability}
                tone={isTop ? 'bg-foreground' : 'bg-foreground/20'}
                height="h-2"
              />
              <span className="text-right text-xs tabular-nums">{formatPct(probability, 0)}</span>
            </div>
          )
        })}
      </div>

      {top?.level ? (
        <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
          <span className="font-medium">Most likely:</span> {top.level}
        </div>
      ) : null}
    </div>
  )
}

export function AnswerCard({ id, question, answer }) {
  if (!answer) return null

  const confidence = confidenceOf(answer)

  return (
    <Card size="sm" className="gap-3">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate font-mono text-sm">{id}</CardTitle>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{question?.instructions}</p>
          </div>
          <Badge variant="outline" className="shrink-0 uppercase">
            {answer.type}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {answer.type === 'noul' ? <NoulAnswer answer={answer} /> : null}
        {answer.type === 'choice' ? <ChoiceAnswer question={question} answer={answer} /> : null}
        {answer.type === 'score' ? <ScoreAnswer answer={answer} /> : null}

        <div className="flex items-center justify-between border-t pt-3">
          <ConfidenceBadge confidence={confidence} />
          <span className="font-mono text-[11px] text-muted-foreground">
            {confidence.toFixed(3)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
