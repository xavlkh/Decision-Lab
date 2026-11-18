import { AlertTriangle, CheckCircle2, Database } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DB_QUESTION_KEYS, FIELD_LABELS } from '@/lib/mock-db'
import { CORE_CUSTOMER_FIELDS } from '@/lib/mock-db-store'

function fieldLabel(field) {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field]
  return field
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatFieldValue(field, value) {
  if (value == null || value === '') return '—'
  if (field === 'monthly_income') {
    return `SGD ${Number(value).toLocaleString('en-SG')} / month`
  }
  return String(value)
}

function CustomerRecord({ customer, matchedBy }) {
  const extraFields = Object.keys(customer).filter(
    (field) => !CORE_CUSTOMER_FIELDS.includes(field),
  )

  return (
    <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
      {CORE_CUSTOMER_FIELDS.map((field) => (
        <div key={field} className="min-w-0">
          <dt className="text-muted-foreground">{fieldLabel(field)}</dt>
          <dd className="truncate font-medium" title={String(customer[field] ?? '')}>
            {formatFieldValue(field, customer[field])}
          </dd>
        </div>
      ))}
      {extraFields.map((field) => (
        <div key={field} className="min-w-0">
          <dt className="text-muted-foreground">{fieldLabel(field)}</dt>
          <dd className="truncate font-medium" title={String(customer[field] ?? '')}>
            {formatFieldValue(field, customer[field])}
          </dd>
        </div>
      ))}
      <div>
        <dt className="text-muted-foreground">Matched by</dt>
        <dd className="font-medium">{fieldLabel(matchedBy)}</dd>
      </div>
    </dl>
  )
}

function Identifiers({ identifiers }) {
  return (
    <p className="text-xs text-muted-foreground">
      Looked up{' '}
      {Object.entries(identifiers)
        .map(([field, value]) => `${fieldLabel(field)} ${value}`)
        .join(', ')}
      .
    </p>
  )
}

function ComparisonTable({ comparison }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 font-medium">Field</th>
            <th className="px-3 py-1.5 font-medium">Form value</th>
            <th className="px-3 py-1.5 font-medium">Database value</th>
          </tr>
        </thead>
        <tbody>
          {comparison.mismatches.map((mismatch) => (
            <tr key={mismatch.field} className="border-t">
              <td className="px-3 py-1.5">{fieldLabel(mismatch.field)}</td>
              <td className="px-3 py-1.5 font-mono text-rose-600 dark:text-rose-400">
                {mismatch.formValue}
              </td>
              <td className="px-3 py-1.5 font-mono">{mismatch.dbValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ModelScores({ scores, analysis }) {
  if (scores.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {analysis.lookupAttempted
          ? `Add the ${DB_QUESTION_KEYS.exists}, ${DB_QUESTION_KEYS.accurate}, or ${DB_QUESTION_KEYS.mismatch} questions to score the model against the database.`
          : 'Add a customer ID, NRIC/FIN, or email to the text input to score the existence check.'}
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      {scores.map((score) => (
        <div
          key={score.key}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs"
        >
          <div className="flex items-center gap-2">
            {score.pass ? (
              <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
            ) : (
              <AlertTriangle className="size-3.5 shrink-0 text-rose-500" />
            )}
            <span className="font-mono font-medium">{score.key}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <span>
              model <span className="font-medium text-foreground">{score.modelLabel}</span>
            </span>
            <span>
              truth <span className="font-medium text-foreground">{score.truthLabel}</span>
            </span>
            <span className="tabular-nums">{score.detail}</span>
            <Badge variant={score.pass ? 'secondary' : 'destructive'}>
              {score.pass ? 'pass' : 'fail'}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}

export function MockDbCheck({ analysis, scores }) {
  const { customer, comparison, identifiers, lookupAttempted } = analysis

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <CardTitle>Mock customer database</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Ground truth comes from the local JSON file, not from the model.
              </p>
            </div>
          </div>
          <Badge variant={customer ? 'secondary' : 'destructive'}>
            {customer
              ? `Found ${customer.customer_id}`
              : lookupAttempted
                ? 'Not in database'
                : 'No lookup key'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {customer ? (
          <CustomerRecord customer={customer} matchedBy={analysis.matchedBy} />
        ) : lookupAttempted ? (
          <Identifiers identifiers={identifiers} />
        ) : (
          <p className="text-xs text-muted-foreground">
            No customer ID, NRIC/FIN, or email was found in the text input. Attached images and
            PDFs are sent to the model, but the mock DB lookup only reads text.
          </p>
        )}

        <div className="space-y-2 border-t pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium">Form vs database</p>
            {comparison ? (
              <Badge variant={comparison.accurate ? 'secondary' : 'destructive'}>
                {comparison.accurate
                  ? 'Accurate'
                  : `${comparison.mismatches.length} mismatch${comparison.mismatches.length === 1 ? '' : 'es'}`}
              </Badge>
            ) : (
              <Badge variant="outline">Not comparable</Badge>
            )}
          </div>

          {comparison ? (
            comparison.mismatches.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                All {comparison.comparedFields.length} comparable fields match the database record.
              </p>
            ) : (
              <ComparisonTable comparison={comparison} />
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              {customer
                ? 'Add form fields as JSON or "Field: value" lines in the text input to compare them with the database record.'
                : 'A matching customer record is needed before fields can be compared.'}
            </p>
          )}
        </div>

        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium">Model vs ground truth</p>
          <ModelScores scores={scores} analysis={analysis} />
        </div>
      </CardContent>
    </Card>
  )
}
