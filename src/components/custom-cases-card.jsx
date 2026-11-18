import {
  Eye,
  FileText,
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { expectedLabel, QUESTION_PRESETS, questionsForCase } from '@/lib/benchmark'

export function CustomCasesCard({
  cases,
  included,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
  onPreview,
  onSelectCustomOnly,
  imageResolution,
  onImageResolutionChange,
  disabled,
  storeError,
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Your cases</CardTitle>
            <CardDescription>
              Add text, image, or PDF cases with the answers you expect. Each case uses
              the question set you choose. Saved in this browser.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Image detail</span>
              <Select
                value={imageResolution}
                onValueChange={onImageResolutionChange}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 w-24 text-xs" aria-label="Image resolution">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || cases.length === 0}
              onClick={onSelectCustomOnly}
            >
              Select custom only
            </Button>

            <Button type="button" onClick={onAdd} disabled={disabled}>
              <Plus />
              Add case
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {storeError ? (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {storeError}
          </p>
        ) : null}

        {cases.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm font-medium">No custom cases yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Add a customer message, a photo of a form, or a PDF, then choose the
              answers you expect. Your cases run alongside the built-in suite.
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-3" disabled={disabled} onClick={onAdd}>
              <Plus />
              Add your first case
            </Button>
          </div>
        ) : (
          <div className="max-h-80 overflow-auto rounded-xl border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">Include</span>
                  </TableHead>
                  <TableHead>Case</TableHead>
                  <TableHead className="w-[320px]">Expected</TableHead>
                  <TableHead className="w-28 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((testCase) => {
                  const questions = questionsForCase(testCase)
                  const images = testCase.media?.filter((item) => item.kind === 'image').length ?? 0
                  const documents =
                    testCase.media?.filter((item) => item.kind === 'document').length ?? 0

                  return (
                    <TableRow key={testCase.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="size-4 accent-foreground"
                          checked={included[testCase.id] !== false}
                          disabled={disabled}
                          onChange={() => onToggle(testCase.id)}
                          aria-label={`Include ${testCase.title}`}
                        />
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{testCase.title}</span>
                          <Badge variant="outline">{testCase.tag}</Badge>
                          <Badge variant="secondary">
                            {QUESTION_PRESETS[testCase.presetId]?.name ?? 'Support triage'}
                          </Badge>
                          {images > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <ImageIcon className="size-3" />
                              {images}
                            </span>
                          ) : null}
                          {documents > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <FileText className="size-3" />
                              {documents}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 max-w-xl text-xs text-muted-foreground">
                          {testCase.state || 'Media-only input'}
                        </p>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(testCase.expected).map(([id, value]) => (
                            <Badge key={id} variant="outline">
                              {id} {expectedLabel(questions[id], value)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex justify-end gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Preview ${testCase.title}`}
                            onClick={() => onPreview(testCase)}
                          >
                            <Eye />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Edit ${testCase.title}`}
                            disabled={disabled}
                            onClick={() => onEdit(testCase)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Delete ${testCase.title}`}
                            disabled={disabled}
                            onClick={() => onDelete(testCase)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
