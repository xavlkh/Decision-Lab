import { ExternalLink, FileText, Image as ImageIcon, X } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/decisions'
import { useObjectUrl } from '@/lib/use-object-url'

export function MediaThumbnail({ item, onRemove, className }) {
  const url = useObjectUrl(item.kind === 'image' && item.file ? item.file : null)

  return (
    <div className={cn('flex items-center gap-2 rounded-lg border bg-muted/30 p-2', className)}>
      {url ? (
        <img
          src={url}
          alt=""
          className="size-9 shrink-0 rounded object-cover ring-1 ring-foreground/10"
        />
      ) : (
        <div className="flex size-9 shrink-0 items-center justify-center rounded bg-muted">
          {item.kind === 'document' ? (
            <FileText className="size-4 text-muted-foreground" />
          ) : (
            <ImageIcon className="size-4 text-muted-foreground" />
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{item.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {item.kind === 'document' ? 'PDF' : 'Image'} · {formatBytes(item.size)}
        </p>
      </div>

      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${item.name}`}
          onClick={onRemove}
        >
          <X />
        </Button>
      ) : null}
    </div>
  )
}

function MediaPreviewItem({ item }) {
  const url = useObjectUrl(item.file)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-medium">{item.name}</span>
        <span className="shrink-0 text-muted-foreground">{formatBytes(item.size)}</span>
      </div>

      {url && item.kind === 'image' ? (
        <img
          src={url}
          alt={item.name}
          className="mx-auto max-h-[45vh] max-w-full rounded-lg object-contain ring-1 ring-foreground/10"
        />
      ) : null}

      {url && item.kind === 'document' ? (
        <object
          data={url}
          type="application/pdf"
          className="h-[45vh] min-h-64 w-full rounded-lg border bg-background"
        >
          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
            This browser cannot display the PDF inline. Use “Open in new tab”.
          </div>
        </object>
      ) : null}

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-3" />
          Open in new tab
        </a>
      ) : null}
    </div>
  )
}

export function MediaPreviewList({ media, className }) {
  if (!media?.length) return null

  return (
    <div className={cn('space-y-4', className)}>
      {media.map((item, index) => (
        <MediaPreviewItem key={`${item.name}-${item.size}-${index}`} item={item} />
      ))}
    </div>
  )
}
