import { useRef, useState } from 'react'
import {
  Database,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { cn } from 'cn'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  CORE_CUSTOMER_FIELDS,
  getDefaultMockCustomers,
  normalizeCustomer,
  normalizeKey,
  resetMockCustomers,
  setMockCustomers,
  useMockCustomers,
} from '@/lib/mock-db-store'

const CORE_FIELD_SET = new Set(CORE_CUSTOMER_FIELDS)

const EMPTY_FORM = {
  customer_id: '',
  name: '',
  nric: '',
  email: '',
  phone: '',
  address: '',
  monthly_income: '',
}

function customKeysOf(records) {
  const keys = []
  const seen = new Set()

  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (CORE_FIELD_SET.has(key) || seen.has(key)) continue
      seen.add(key)
      keys.push(key)
    }
  }

  return keys
}

function toForm(record, customKeys) {
  const source = record ?? {}
  const form = {
    ...EMPTY_FORM,
    customer_id: String(source.customer_id ?? ''),
    name: String(source.name ?? ''),
    nric: String(source.nric ?? ''),
    email: String(source.email ?? ''),
    phone: String(source.phone ?? ''),
    address: String(source.address ?? ''),
    monthly_income: source.monthly_income == null ? '' : String(source.monthly_income),
    customFields: customKeys.map((key) => ({
      key,
      value: source[key] == null ? '' : String(source[key]),
    })),
  }

  const existing = new Set(customKeys)
  for (const [key, value] of Object.entries(source)) {
    if (CORE_FIELD_SET.has(key) || existing.has(key)) continue
    form.customFields.push({
      key,
      value: value == null ? '' : String(value),
    })
  }

  return form
}

function formatIncome(value) {
  if (value == null || value === '') return '—'
  return `SGD ${Number(value).toLocaleString('en-SG')}`
}

function Field({ id, label, value, onChange, placeholder, className, inputMode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function CustomerDialog({
  open,
  onOpenChange,
  index,
  record,
  customers,
  customKeys,
  onSave,
}) {
  const [form, setForm] = useState(() => toForm(record, customKeys))
  const [error, setError] = useState(null)

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function addCustomField() {
    setForm((current) => ({
      ...current,
      customFields: [...current.customFields, { key: '', value: '' }],
    }))
  }

  function updateCustomField(fieldIndex, patch) {
    setForm((current) => ({
      ...current,
      customFields: current.customFields.map((field, currentIndex) =>
        currentIndex === fieldIndex ? { ...field, ...patch } : field,
      ),
    }))
  }

  function removeCustomField(fieldIndex) {
    setForm((current) => ({
      ...current,
      customFields: current.customFields.filter(
        (_, currentIndex) => currentIndex !== fieldIndex,
      ),
    }))
  }

  function submit(event) {
    event.preventDefault()

    const customerId = form.customer_id.trim().toUpperCase()
    const name = form.name.trim()
    if (!customerId) {
      setError('Customer ID is required.')
      return
    }
    if (!name) {
      setError('Name is required.')
      return
    }

    const duplicate = customers.some(
      (customer, customerIndex) =>
        customerIndex !== index && customer.customer_id === customerId,
    )
    if (duplicate) {
      setError(`Customer ID ${customerId} is already in the database.`)
      return
    }

    const incomeText = form.monthly_income.trim()
    const incomeDigits = incomeText.replace(/[^0-9.]/g, '')
    if (incomeText && (!incomeDigits || !Number.isFinite(Number(incomeDigits)))) {
      setError('Monthly income must be a number, or left blank.')
      return
    }

    const customFields = {}
    const seenKeys = new Set()
    for (const field of form.customFields) {
      const key = normalizeKey(field.key)
      const value = field.value.trim()
      if (!key) {
        if (value) {
          setError('Every custom field value needs a field name.')
          return
        }
        continue
      }
      if (CORE_FIELD_SET.has(key)) {
        setError(`"${key}" is a standard field; edit it above instead.`)
        return
      }
      if (seenKeys.has(key)) {
        setError(`Duplicate custom field "${key}".`)
        return
      }
      seenKeys.add(key)
      customFields[key] = value
    }

    onSave(index, {
      customer_id: customerId,
      name,
      nric: form.nric.trim().toUpperCase(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      monthly_income: incomeText ? Number(incomeDigits) : null,
      ...customFields,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{index == null ? 'Add customer' : 'Edit customer'}</DialogTitle>
          <DialogDescription>
            Synthetic data only. Saved in this browser and used for DB lookups.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="mock-customer-id"
              label="Customer ID"
              value={form.customer_id}
              onChange={(value) => setField('customer_id', value)}
              placeholder="CUST-1006"
            />
            <Field
              id="mock-customer-name"
              label="Name"
              value={form.name}
              onChange={(value) => setField('name', value)}
              placeholder="Customer name"
            />
            <Field
              id="mock-customer-nric"
              label="NRIC/FIN"
              value={form.nric}
              onChange={(value) => setField('nric', value)}
              placeholder="S1234567A"
            />
            <Field
              id="mock-customer-email"
              label="Email"
              value={form.email}
              onChange={(value) => setField('email', value)}
              placeholder="customer@example.com"
            />
            <Field
              id="mock-customer-phone"
              label="Phone"
              value={form.phone}
              onChange={(value) => setField('phone', value)}
              placeholder="+65 9123 4567"
            />
            <Field
              id="mock-customer-income"
              label="Monthly income"
              value={form.monthly_income}
              onChange={(value) => setField('monthly_income', value)}
              placeholder="8500"
              inputMode="decimal"
            />
            <Field
              id="mock-customer-address"
              label="Address"
              value={form.address}
              onChange={(value) => setField('address', value)}
              placeholder="Street, unit, postal code"
              className="sm:col-span-2"
            />
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium">Custom fields</p>
                <p className="text-[11px] text-muted-foreground">
                  Compared when the same field name appears in the form. Use
                  snake_case, for example account_number.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomField}
              >
                <Plus className="size-3" />
                Add field
              </Button>
            </div>

            {form.customFields.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No custom fields. Add one to store extra data such as account
                number, card number, or date of birth.
              </p>
            ) : null}

            {form.customFields.map((field, fieldIndex) => (
              <div
                key={fieldIndex}
                className="flex flex-wrap items-center gap-2"
              >
                <Input
                  value={field.key}
                  onChange={(event) =>
                    updateCustomField(fieldIndex, { key: event.target.value })
                  }
                  placeholder="account_number"
                  aria-label={`Custom field ${fieldIndex + 1} name`}
                  className="h-8 w-48 font-mono text-xs"
                />
                <Input
                  value={field.value}
                  onChange={(event) =>
                    updateCustomField(fieldIndex, { value: event.target.value })
                  }
                  placeholder="Value"
                  aria-label={`Custom field ${fieldIndex + 1} value`}
                  className="h-8 flex-1 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove custom field ${fieldIndex + 1}`}
                  onClick={() => removeCustomField(fieldIndex)}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>

          {error ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Save customer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function parseCustomers(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That is not valid JSON.')
  }

  const list = Array.isArray(parsed) ? parsed : parsed?.customers
  if (!Array.isArray(list)) {
    throw new Error('Use an array of customers, or an object with a "customers" array.')
  }

  const seen = new Set()
  return list.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`Record ${index + 1} is not an object.`)
    }

    const customer = normalizeCustomer(record)
    if (!customer.customer_id) {
      throw new Error(`Record ${index + 1} needs a customer_id.`)
    }
    if (!customer.name) {
      throw new Error(`Record ${index + 1} needs a name.`)
    }
    const incomeText =
      record.monthly_income == null ? '' : String(record.monthly_income).trim()
    const incomeDigits = incomeText.replace(/[^0-9.]/g, '')
    if (incomeText && (!incomeDigits || !Number.isFinite(Number(incomeDigits)))) {
      throw new Error(`Record ${index + 1} has a non-numeric monthly_income.`)
    }
    if (seen.has(customer.customer_id)) {
      throw new Error(`Duplicate customer_id ${customer.customer_id}.`)
    }

    seen.add(customer.customer_id)
    return customer
  })
}

function ImportDialog({ open, onOpenChange, customers, onImport }) {
  const [text, setText] = useState(() => JSON.stringify(customers, null, 2))
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  async function loadFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      setText(await file.text())
      setError(null)
    } catch {
      setError('Could not read that file.')
    }
  }

  function submit(event) {
    event.preventDefault()
    try {
      onImport(parseCustomers(text))
    } catch (caught) {
      setError(caught.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import mock customers</DialogTitle>
          <DialogDescription>
            Paste JSON or load a file. This replaces the current database in this
            browser. Use an array, or an object with a customers array.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-label="Choose mock DB JSON file"
              onChange={loadFile}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload />
              Choose JSON file
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {JSON.stringify(customers).length} characters currently saved
            </span>
          </div>

          <Textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setError(null)
            }}
            rows={14}
            spellCheck={false}
            className="min-h-72 resize-y font-mono text-xs"
            aria-label="Mock customers JSON"
          />

          {error ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Replace database</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ColumnDialog({ open, onOpenChange, existing, onAdd }) {
  const [name, setName] = useState('')
  const [error, setError] = useState(null)

  function submit(event) {
    event.preventDefault()
    const key = normalizeKey(name)
    if (!key) {
      setError('Column name is required.')
      return
    }
    if (CORE_FIELD_SET.has(key)) {
      setError(`"${key}" is a standard column.`)
      return
    }
    if (existing.includes(key)) {
      setError(`The "${key}" column already exists.`)
      return
    }
    onAdd(key)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a custom column</DialogTitle>
          <DialogDescription>
            The column is added to every customer with an empty value. Use
            snake_case, for example account_number.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mock-custom-column" className="text-xs">
              Column name
            </Label>
            <Input
              id="mock-custom-column"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setError(null)
              }}
              placeholder="account_number"
              className="font-mono text-xs"
              autoFocus
            />
          </div>

          {error ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Add column</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function MockDbPanel() {
  const customers = useMockCustomers()
  const customKeys = customKeysOf(customers)
  const [editOpen, setEditOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [columnOpen, setColumnOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(null)

  const defaultCount = getDefaultMockCustomers().length

  function openAdd() {
    setEditingIndex(null)
    setEditOpen(true)
  }

  function openEdit(index) {
    setEditingIndex(index)
    setEditOpen(true)
  }

  function saveCustomer(index, record) {
    const next = [...customers]
    if (index == null) next.push(record)
    else next[index] = record
    setMockCustomers(next)
    setEditOpen(false)
    setEditingIndex(null)
  }

  function removeCustomer(index) {
    const customer = customers[index]
    if (
      !window.confirm(
        `Delete ${customer.customer_id} (${customer.name}) from the mock DB?`,
      )
    ) {
      return
    }
    setMockCustomers(customers.filter((_, customerIndex) => customerIndex !== index))
  }

  function resetToDefaults() {
    if (
      !window.confirm(
        `Reset the mock DB to the ${defaultCount} bundled records? Your local edits will be lost.`,
      )
    ) {
      return
    }
    resetMockCustomers()
  }

  function addColumn(key) {
    setMockCustomers(
      customers.map((customer) => ({ ...customer, [key]: customer[key] ?? '' })),
    )
    setColumnOpen(false)
  }

  function removeColumn(key) {
    if (!window.confirm(`Remove the "${key}" column from every customer?`)) {
      return
    }
    setMockCustomers(
      customers.map((customer) => {
        const next = { ...customer }
        delete next[key]
        return next
      }),
    )
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(customers, null, 2))
      setCopied(true)
      setCopyError(null)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError('Could not copy the JSON to the clipboard.')
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(customers, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'mock-customers.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="size-4 text-muted-foreground" />
                Mock customer database
              </CardTitle>
              <CardDescription>
                {customers.length} record{customers.length === 1 ? '' : 's'} used by
                Playground and Documents lookups. Changes are saved in this browser.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono">
              localStorage
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={openAdd}>
              <Plus />
              Add customer
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setColumnOpen(true)}
              disabled={customers.length === 0}
              title={
                customers.length === 0
                  ? 'Add a customer before adding a custom column'
                  : undefined
              }
            >
              <Plus />
              Add column
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload />
              Import JSON
            </Button>
            <Button variant="outline" size="sm" onClick={exportJson}>
              <Download />
              Export JSON
            </Button>
            <Button variant="ghost" size="sm" onClick={copyJson}>
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-rose-600 hover:text-rose-700 dark:text-rose-400"
              onClick={resetToDefaults}
            >
              <RotateCcw />
              Reset to defaults
            </Button>
          </div>

          {copyError ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">{copyError}</p>
          ) : null}

          <p className="text-[11px] text-muted-foreground">
            Changes apply immediately to new Playground and Documents runs. The bundled
            defaults stay in <span className="font-mono">src/data/mock-customers.json</span>;
            use Reset to defaults to reload them. Keep this data synthetic; it is visible
            to anyone using the deployed app.
          </p>

          <div className="rounded-xl border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Customer ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>NRIC/FIN</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  {customKeys.map((key) => (
                    <TableHead key={key}>
                      <span className="inline-flex items-center gap-1">
                        <span className="font-mono text-xs">{key}</span>
                        <button
                          type="button"
                          className="rounded-sm text-muted-foreground transition-colors hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-rose-400"
                          aria-label={`Remove column ${key}`}
                          onClick={() => removeColumn(key)}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Monthly income</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8 + customKeys.length}
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      No customers. Add one, import JSON, or reset to the bundled
                      defaults.
                    </TableCell>
                  </TableRow>
                ) : null}

                {customers.map((customer, index) => (
                  <TableRow key={`${customer.customer_id}-${index}`}>
                    <TableCell className="font-mono text-xs">
                      {customer.customer_id}
                    </TableCell>
                    <TableCell className="text-xs">{customer.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {customer.nric || '—'}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-xs" title={customer.email}>
                      {customer.email || '—'}
                    </TableCell>
                    <TableCell className="text-xs">{customer.phone || '—'}</TableCell>
                    <TableCell
                      className="max-w-64 truncate text-xs"
                      title={customer.address}
                    >
                      {customer.address || '—'}
                    </TableCell>
                    {customKeys.map((key) => (
                      <TableCell
                        key={key}
                        className="max-w-48 truncate text-xs"
                        title={customer[key] == null ? '' : String(customer[key])}
                      >
                        {customer[key] == null || customer[key] === ''
                          ? '—'
                          : String(customer[key])}
                      </TableCell>
                    ))}
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatIncome(customer.monthly_income)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${customer.customer_id}`}
                          onClick={() => openEdit(index)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-rose-600 hover:text-rose-700 dark:text-rose-400"
                          aria-label={`Delete ${customer.customer_id}`}
                          onClick={() => removeCustomer(index)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {editOpen ? (
        <CustomerDialog
          key={editingIndex ?? 'new'}
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open)
            if (!open) setEditingIndex(null)
          }}
          index={editingIndex}
          record={editingIndex == null ? null : customers[editingIndex]}
          customers={customers}
          customKeys={customKeys}
          onSave={saveCustomer}
        />
      ) : null}

      {columnOpen ? (
        <ColumnDialog
          open={columnOpen}
          onOpenChange={setColumnOpen}
          existing={customKeys}
          onAdd={addColumn}
        />
      ) : null}

      {importOpen ? (
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          customers={customers}
          onImport={(records) => {
            setMockCustomers(records)
            setImportOpen(false)
          }}
        />
      ) : null}
    </>
  )
}
