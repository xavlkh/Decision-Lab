import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

export function QuestionPreview({ questions }) {
  return (
    <div className="space-y-2">
      {Object.entries(questions).map(([id, question]) => (
        <div key={id} className="rounded-lg border bg-muted/30 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-medium">{id}</span>
            <Badge variant="outline" className="uppercase">
              {question.type}
            </Badge>
          </div>

          <p className="mt-1 text-foreground">{question.instructions}</p>

          {question.type === 'choice' ? (
            <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
              {Object.entries(question.criteria).map(([key, value]) => (
                <li key={key}>
                  <span className="font-mono text-foreground/80">{key}</span>
                  {value ? ` — ${value}` : ''}
                </li>
              ))}
            </ul>
          ) : null}

          {question.type === 'score' ? (
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-muted-foreground">
              {question.criteria.map((level, index) => (
                <li key={index}>{level}</li>
              ))}
            </ol>
          ) : null}

          {question.type === 'noul' && question.criteria ? (
            <div className="mt-1.5 space-y-0.5 text-muted-foreground">
              {question.criteria.true_description ? (
                <p>
                  <span className="font-medium text-foreground/80">True:</span>{' '}
                  {question.criteria.true_description}
                </p>
              ) : null}
              {question.criteria.false_description ? (
                <p>
                  <span className="font-medium text-foreground/80">False:</span>{' '}
                  {question.criteria.false_description}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function PreviewDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-4 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="max-h-[70vh] overflow-auto pr-1">{children}</div>

        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}
