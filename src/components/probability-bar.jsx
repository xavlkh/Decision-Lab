import { cn } from 'cn'

export function ProbabilityBar({ value, tone = 'bg-foreground', className, height = 'h-1.5' }) {
  const width = Math.max(0, Math.min(1, Number(value) || 0)) * 100

  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-muted', height, className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-500 ease-out', tone)}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
