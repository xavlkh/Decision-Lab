import { cn } from 'cn'
import { confidenceBarTone, confidenceTone, formatPct } from '@/lib/decisions'

export function ConfidenceBadge({ confidence, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium tabular-nums',
        confidenceTone(confidence),
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', confidenceBarTone(confidence))} />
      {formatPct(confidence, 0)} confident
    </span>
  )
}
