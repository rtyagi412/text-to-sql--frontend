"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  Loader2Icon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { EmailChipsInput } from "@/components/email-chips-input"
import { listApprovedPatterns } from "@/lib/approved-patterns"
import {
  isValidationDetail,
  nextDayMidnight,
  scheduleReport,
  ScheduleReportError,
  withOffset,
  type Align,
  type Frequency,
  type RenderFormat,
  type ScheduleReportRequest,
  type ScheduleReportResponse,
} from "@/lib/schedule-report"
import { cn } from "cn"

// "once" is not an API frequency: it is sent as a daily schedule that ends
// at midnight after the first run.
type UiFrequency = Frequency | "once"

type ColumnRow = {
  uid: number
  name: string
  header: string
  format: string
  align: Align | ""
  width_cm: string
}

// Keys match the API field names, so a 422 `loc` maps straight onto a field.
type FormValues = {
  ritm: string
  report_name: string
  title: string
  landscape: boolean
  overwrite: boolean
  columns: ColumnRow[]
  frequency: UiFrequency
  start: string
  end: string
  interval: string
  days_of_week: string[]
  days_of_month: number[]
  recipients: string[]
  cc: string[]
  render_format: RenderFormat
  subject: string
  comment: string
  include_link: boolean
  description: string
  active: boolean
}

type Errors = Record<string, string>

const INITIAL: FormValues = {
  ritm: "",
  report_name: "",
  title: "",
  landscape: true,
  overwrite: false,
  columns: [],
  frequency: "weekly",
  start: "",
  end: "",
  interval: "",
  days_of_week: [],
  days_of_month: [],
  recipients: [],
  cc: [],
  render_format: "MHTML",
  subject: "",
  comment: "",
  include_link: false,
  description: "",
  active: true,
}

const FREQUENCIES: { value: UiFrequency; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
]

const RENDER_FORMATS: { value: RenderFormat; label: string }[] = [
  { value: "MHTML", label: "In the email body" },
  { value: "PDF", label: "PDF attachment" },
  { value: "EXCELOPENXML", label: "Excel attachment (.xlsx)" },
  { value: "CSV", label: "CSV attachment" },
  { value: "WORDOPENXML", label: "Word attachment (.docx)" },
  { value: "PPTX", label: "PowerPoint attachment (.pptx)" },
  { value: "XML", label: "XML attachment" },
  { value: "IMAGE", label: "Image attachment" },
]

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]

const ALIGNS: Align[] = ["Left", "Center", "Right"]

const FIELDS = new Set([
  "report_name",
  "title",
  "columns",
  "frequency",
  "start",
  "end",
  "interval",
  "days_of_week",
  "days_of_month",
  "recipients",
  "cc",
  "render_format",
  "subject",
  "comment",
  "description",
])

const COLUMN_FIELDS = new Set(["name", "header", "format", "align", "width_cm"])

// The query comes from an approved RITM, so it is shown for review and never
// edited here.
type Approved = {
  ritm: string
  sql: string
  approvedAt: string
  // The ticket's own name; falls back to the title saved with the approval.
  title: string
  ticketFetched: boolean
}

// The report name allows only some characters, so a ticket title is cleaned up
// to fit and falls back to the RITM number.
function toReportName(title: string, ritm: string): string {
  const cleaned = title
    .replace(/[^A-Za-z0-9 _().-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim()
  return cleaned && !/^\.+$/.test(cleaned) ? cleaned : ritm.slice(0, 100)
}

const REPORT_NAME = /^[A-Za-z0-9 _().-]+$/

function validate(v: FormValues, approved: Approved | null): Errors {
  const e: Errors = {}

  if (!approved) e.ritm = "Look up an approved RITM to use its query."

  const name = v.report_name.trim()
  if (!name) e.report_name = "Enter a report name."
  else if (name.length > 100)
    e.report_name = "The name must be 100 characters or fewer."
  else if (!REPORT_NAME.test(name))
    e.report_name = "Use only letters, digits, spaces and _ ( ) - ."
  else if (/^\.+$/.test(name)) e.report_name = "The name can't be only dots."

  v.columns.forEach((c, i) => {
    const filled = c.name || c.header || c.format || c.align || c.width_cm
    if (!filled) return
    if (!c.name.trim())
      e[`columns.${i}.name`] = "Enter the column name from the SQL."
    if (c.width_cm.trim()) {
      const w = Number(c.width_cm)
      if (!Number.isFinite(w) || w < 1 || w > 20)
        e[`columns.${i}.width_cm`] = "1 to 20 cm."
    }
  })

  const start = new Date(v.start)
  if (!v.start) e.start = "Choose when the first run happens."
  else if (Number.isNaN(start.getTime())) e.start = "Enter a valid date and time."
  else if (start.getTime() <= Date.now())
    e.start = "The first run must be in the future."

  if (
    v.frequency !== "once" &&
    v.end &&
    v.start &&
    v.end < v.start.slice(0, 10)
  )
    e.end = "The end date can't be before the start date."

  if ((v.frequency === "daily" || v.frequency === "weekly") && v.interval) {
    const n = Number(v.interval)
    if (!Number.isInteger(n) || n < 1 || n > 52)
      e.interval = "Enter a whole number from 1 to 52."
  }

  if (v.recipients.length === 0) e.recipients = "Add at least one recipient."

  return e
}

// Only what the user filled in: an empty optional field would override the
// server's default, so it is left out.
function buildBody(v: FormValues, approved: Approved): ScheduleReportRequest {
  // The server already headlines a report with its name.
  const title = v.title.trim() === v.report_name.trim() ? "" : v.title.trim()
  const columns = v.columns
    .filter((c) => c.name.trim())
    .map((c) => ({
      name: c.name.trim(),
      ...(c.header.trim() && { header: c.header.trim() }),
      ...(c.format.trim() && { format: c.format.trim() }),
      ...(c.align && { align: c.align }),
      ...(c.width_cm.trim() && { width_cm: Number(c.width_cm) }),
    }))

  const once = v.frequency === "once"
  // The last day runs through the day, so the schedule ends at the next midnight.
  const endDate = once ? v.start.slice(0, 10) : v.end
  const daysOfMonth = [...v.days_of_month].sort((a, b) => a - b)

  const subject = v.subject.trim()
  const comment = v.comment.trim()
  const description = v.description.trim()

  return {
    sql: approved.sql,
    report_name: v.report_name.trim(),
    ...((title || !v.landscape) && {
      layout: {
        ...(title && { title }),
        ...(!v.landscape && { landscape: false }),
      },
    }),
    ...(columns.length > 0 && { columns }),
    ...(v.overwrite && { overwrite: true }),
    schedule: {
      frequency: v.frequency === "once" ? "daily" : v.frequency,
      start: withOffset(v.start),
      ...(endDate && { end: withOffset(nextDayMidnight(endDate)) }),
      ...(!once &&
        v.frequency !== "monthly" &&
        v.interval && { interval: Number(v.interval) }),
      ...(v.frequency === "weekly" &&
        v.days_of_week.length > 0 && {
          days_of_week: WEEKDAYS.filter((d) => v.days_of_week.includes(d)),
        }),
      ...(v.frequency === "monthly" &&
        daysOfMonth.length > 0 && { days_of_month: daysOfMonth }),
    },
    recipients: v.recipients,
    ...(v.cc.length > 0 && { cc: v.cc }),
    ...(v.render_format !== "MHTML" && { render_format: v.render_format }),
    ...(subject && { subject }),
    ...(comment && { comment }),
    ...(v.include_link && { include_link: true }),
    ...(description && { description }),
    ...(!v.active && { active: false }),
  }
}

// SSRS's own description is often empty, so the summary comes from the form.
function describeSchedule(v: FormValues): string {
  const start = new Date(v.start)
  const time = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  const date = (d: Date) => d.toLocaleDateString(undefined, { dateStyle: "medium" })
  const zone = `UTC${withOffset(v.start).slice(-6)}`
  const n = Number(v.interval) || 1
  const weekday = start.toLocaleDateString("en-US", { weekday: "long" })

  if (v.frequency === "once")
    return `Once, on ${date(start)} at ${time} (${zone})`

  let cadence: string
  if (v.frequency === "daily") {
    cadence = n > 1 ? `Every ${n} days` : "Daily"
  } else if (v.frequency === "weekly") {
    const days = WEEKDAYS.filter((d) => v.days_of_week.includes(d))
    const on = days.length > 0 ? days.join(", ") : weekday
    cadence = `${n > 1 ? `Every ${n} weeks` : "Weekly"} on ${on}`
  } else {
    const days = [...v.days_of_month].sort((a, b) => a - b)
    cadence = `Monthly on day ${(days.length > 0 ? days : [start.getDate()]).join(", ")}`
  }

  const [y, m, d] = v.end ? v.end.split("-").map(Number) : []
  const until = v.end ? `, until ${date(new Date(y, m - 1, d))}` : ""
  return `${cadence} at ${time} (${zone}), from ${date(start)}${until}`
}

// Maps a FastAPI 422 `loc` (["body", "schedule", "start"], or
// ["body", "columns", 1, "width_cm"]) onto one of this form's error keys.
function errorKeyFromLoc(loc: (string | number)[]): string | null {
  const ci = loc.indexOf("columns")
  if (ci >= 0 && typeof loc[ci + 1] === "number") {
    const field = loc[ci + 2]
    return typeof field === "string" && COLUMN_FIELDS.has(field)
      ? `columns.${loc[ci + 1]}.${field}`
      : "columns"
  }
  const last = [...loc].reverse().find((p) => typeof p === "string") as
    | string
    | undefined
  return last && FIELDS.has(last) ? last : null
}

type ApiError = { status: number; message: string; canOverwrite: boolean }

function toApiError(err: unknown): ApiError {
  if (err instanceof ScheduleReportError) {
    const detail = typeof err.detail === "string" ? err.detail : ""
    if (err.status === 503)
      return {
        status: 503,
        message: "Reporting is not set up. Contact an admin.",
        canOverwrite: false,
      }
    return {
      status: err.status,
      message: detail || `Request failed (${err.status}).`,
      // A 502 that left the report on the server is retried by replacing it.
      canOverwrite: err.status === 502 && /\bstill\b/i.test(detail),
    }
  }
  if (err instanceof DOMException && err.name === "TimeoutError")
    return {
      status: 0,
      message:
        "The request took longer than two minutes. The report may have been created anyway, so check the SSRS portal before retrying.",
      canOverwrite: false,
    }
  return {
    status: 0,
    message:
      err instanceof TypeError
        ? "Could not reach the backend at http://localhost:8000."
        : "Something went wrong.",
    canOverwrite: false,
  }
}

type Done = {
  ritm: string
  response: ScheduleReportResponse
  schedule: string
  cc: string[]
}

export function ScheduleReportForm() {
  const [v, setV] = React.useState<FormValues>(INITIAL)
  const [errors, setErrors] = React.useState<Errors>({})
  const [apiError, setApiError] = React.useState<ApiError | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [done, setDone] = React.useState<Done | null>(null)
  const [approved, setApproved] = React.useState<Approved | null>(null)
  const [lookingUp, setLookingUp] = React.useState(false)
  const [notApproved, setNotApproved] = React.useState(false)
  // Ignore a lookup that lands after the RITM was edited or looked up again.
  const lookupRun = React.useRef(0)
  const formRef = React.useRef<HTMLFormElement>(null)
  const doneRef = React.useRef<HTMLDivElement>(null)
  const nextUid = React.useRef(0)

  React.useEffect(() => {
    if (done) doneRef.current?.focus()
  }, [done])

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const clear = (k: string) =>
        k === key || (key === "columns" && k.startsWith("columns."))
      if (!Object.keys(prev).some(clear)) return prev
      return Object.fromEntries(Object.entries(prev).filter(([k]) => !clear(k)))
    })
  }

  function focusFirstInvalid() {
    requestAnimationFrame(() =>
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus(),
    )
  }

  function toggle<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
  }

  function updateColumn(uid: number, patch: Partial<ColumnRow>) {
    set(
      "columns",
      v.columns.map((c) => (c.uid === uid ? { ...c, ...patch } : c)),
    )
  }

  function onRitmChange(value: string) {
    lookupRun.current++
    setLookingUp(false)
    setNotApproved(false)
    setApproved(null)
    set("ritm", value)
  }

  // The query is whatever was approved for the ticket on Generate SQL; the
  // ticket itself supplies the name and heading.
  async function lookUp() {
    const ritm = v.ritm.trim()
    if (!ritm || lookingUp) return
    const run = ++lookupRun.current
    setLookingUp(true)
    setNotApproved(false)
    setApproved(null)

    const pattern = listApprovedPatterns().find(
      (p) => p.ritm.toLowerCase() === ritm.toLowerCase(),
    )
    if (!pattern) {
      setNotApproved(true)
      setLookingUp(false)
      return
    }

    let title = pattern.title
    let ticketFetched = false
    try {
      const res = await fetch(`/api/ritm/${encodeURIComponent(pattern.ritm)}`)
      const ticket = res.ok ? await res.json() : null
      if (typeof ticket?.name === "string" && ticket.name.trim()) {
        title = ticket.name.trim()
        ticketFetched = true
      }
    } catch {
      // The title saved with the approval is used instead.
    }
    if (run !== lookupRun.current) return

    setApproved({
      ritm: pattern.ritm,
      sql: pattern.sql,
      approvedAt: pattern.approvedAt,
      title,
      ticketFetched,
    })
    setV((prev) => ({
      ...prev,
      ritm: pattern.ritm,
      report_name: toReportName(title, pattern.ritm),
      title,
      description: `${pattern.ritm}: ${title}`,
    }))
    setErrors({})
    setLookingUp(false)
  }

  async function submit(overrides?: Partial<FormValues>) {
    if (submitting) return
    const values = { ...v, ...overrides }
    if (overrides) setV(values)

    const found = validate(values, approved)
    setErrors(found)
    setApiError(null)
    if (!approved || Object.keys(found).length > 0) {
      focusFirstInvalid()
      return
    }

    setSubmitting(true)
    try {
      const response = await scheduleReport(buildBody(values, approved))
      setDone({
        ritm: approved.ritm,
        response,
        schedule: describeSchedule(values),
        cc: values.cc,
      })
    } catch (err) {
      if (err instanceof ScheduleReportError && err.status === 409) {
        setErrors({
          report_name: "Name already in use. Choose another name.",
        })
        focusFirstInvalid()
      } else if (
        err instanceof ScheduleReportError &&
        err.status === 422 &&
        isValidationDetail(err.detail)
      ) {
        const fieldErrors: Errors = {}
        const leftover: string[] = []
        for (const { loc, msg } of err.detail) {
          const key = errorKeyFromLoc(loc)
          if (key) fieldErrors[key] ??= msg
          else leftover.push(msg)
        }
        setErrors(fieldErrors)
        if (leftover.length > 0)
          setApiError({
            status: 422,
            message: leftover.join(" "),
            canOverwrite: false,
          })
        focusFirstInvalid()
      } else {
        setApiError(toApiError(err))
      }
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setV(INITIAL)
    setErrors({})
    setApiError(null)
    setDone(null)
    setApproved(null)
    setNotApproved(false)
    lookupRun.current++
  }

  if (done) {
    return (
      <Confirmation
        ref={doneRef}
        done={done}
        onAnother={reset}
      />
    )
  }

  // Props that tie a control to its label, hint and error message.
  const ctl = (id: string, hint = false) => ({
    id,
    "aria-invalid": errors[id] ? (true as const) : undefined,
    "aria-describedby": errors[id]
      ? `${id}-error`
      : hint
        ? `${id}-hint`
        : undefined,
  })

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle>Approved query</CardTitle>
          <CardDescription>
            Enter a RITM whose SQL has been reviewed and approved. That query
            becomes the report, and the ticket supplies its name and heading.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field id="ritm" label="RITM number" error={errors.ritm}>
            <div className="flex gap-2">
              <Input
                {...ctl("ritm")}
                value={v.ritm}
                onChange={(e) => onRitmChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void lookUp()
                  }
                }}
                placeholder="RITM0040015"
                autoComplete="off"
                disabled={submitting}
              />
              <Button
                type="button"
                variant={approved ? "outline" : "default"}
                onClick={() => void lookUp()}
                disabled={submitting || lookingUp || !v.ritm.trim()}
              >
                {lookingUp ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SearchIcon />
                )}
                {lookingUp ? "Looking up..." : "Find query"}
              </Button>
            </div>
          </Field>

          {notApproved && (
            <Alert role="alert">
              <AlertCircleIcon />
              <AlertTitle>No approved query for this RITM</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  A report can only be scheduled from SQL that has been
                  generated, reviewed and approved. Do that first, then come
                  back.
                </p>
                <Link
                  href="/generate-sql"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Go to Generate SQL
                </Link>
              </AlertDescription>
            </Alert>
          )}

          {approved && <ApprovedReview approved={approved} />}
        </CardContent>
      </Card>

      {approved && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Report</CardTitle>
              <CardDescription>
                Filled in from the ticket. Change them if needed; the name must be
                unique in SSRS.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <Field
                id="report_name"
                label="Report name"
                error={errors.report_name}
                hint="Letters, digits, spaces and _ ( ) - . only, up to 100 characters."
              >
                <Input
                  {...ctl("report_name", true)}
                  value={v.report_name}
                  onChange={(e) => set("report_name", e.target.value)}
                  maxLength={100}
                  autoComplete="off"
                  disabled={submitting}
                />
              </Field>

              <div className="grid items-end gap-5 sm:grid-cols-[1fr_auto]">
                <Field
                  id="title"
                  label="Report heading"
                  optional
                  error={errors.title}
                  hint="Defaults to the report name."
                >
                  <Input
                    {...ctl("title", true)}
                    value={v.title}
                    onChange={(e) => set("title", e.target.value)}
                    autoComplete="off"
                    disabled={submitting}
                  />
                </Field>
                <CheckField
                  label="Landscape"
                  checked={v.landscape}
                  onChange={(c) => set("landscape", c)}
                  disabled={submitting}
                  className="sm:pb-2"
                />
              </div>

              <ColumnsEditor
                columns={v.columns}
                errors={errors}
                disabled={submitting}
                onAdd={() =>
                  set("columns", [
                    ...v.columns,
                    {
                      uid: nextUid.current++,
                      name: "",
                      header: "",
                      format: "",
                      align: "",
                      width_cm: "",
                    },
                  ])
                }
                onRemove={(uid) =>
                  set(
                    "columns",
                    v.columns.filter((c) => c.uid !== uid),
                  )
                }
                onChange={updateColumn}
              />

              <CheckField
                label="Replace the report if one with this name already exists"
                description="Off by default, so an existing report is never overwritten by accident."
                checked={v.overwrite}
                onChange={(c) => set("overwrite", c)}
                disabled={submitting}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <CardDescription>
                When the report runs. Times use your browser&apos;s time zone.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="frequency" label="Repeats" error={errors.frequency}>
                  <NativeSelect
                    {...ctl("frequency")}
                    value={v.frequency}
                    onChange={(e) => set("frequency", e.target.value as UiFrequency)}
                    disabled={submitting}
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field
                  id="start"
                  label={v.frequency === "once" ? "Runs at" : "First run"}
                  error={errors.start}
                >
                  <Input
                    {...ctl("start")}
                    type="datetime-local"
                    value={v.start}
                    onChange={(e) => set("start", e.target.value)}
                    disabled={submitting}
                  />
                </Field>
              </div>

              {(v.frequency === "daily" || v.frequency === "weekly") && (
                <Field
                  id="interval"
                  label={`Repeat every ${v.frequency === "daily" ? "N days" : "N weeks"}`}
                  optional
                  error={errors.interval}
                  hint="1 to 52. Leave empty for every one."
                  className="sm:max-w-48"
                >
                  <Input
                    {...ctl("interval", true)}
                    type="number"
                    min={1}
                    max={52}
                    inputMode="numeric"
                    value={v.interval}
                    onChange={(e) => set("interval", e.target.value)}
                    placeholder="1"
                    disabled={submitting}
                  />
                </Field>
              )}

              {v.frequency === "weekly" && (
                <ToggleGroup
                  legend="Days of the week"
                  hint="Defaults to the weekday of the first run."
                  error={errors.days_of_week}
                >
                  {WEEKDAYS.map((d) => (
                    <ToggleButton
                      key={d}
                      pressed={v.days_of_week.includes(d)}
                      onClick={() => set("days_of_week", toggle(v.days_of_week, d))}
                      disabled={submitting}
                      label={d}
                    >
                      {d.slice(0, 3)}
                    </ToggleButton>
                  ))}
                </ToggleGroup>
              )}

              {v.frequency === "monthly" && (
                <ToggleGroup
                  legend="Days of the month"
                  hint="Defaults to the day of the first run."
                  error={errors.days_of_month}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <ToggleButton
                      key={d}
                      pressed={v.days_of_month.includes(d)}
                      onClick={() => set("days_of_month", toggle(v.days_of_month, d))}
                      disabled={submitting}
                      label={`Day ${d}`}
                      square
                    >
                      {d}
                    </ToggleButton>
                  ))}
                </ToggleGroup>
              )}

              {v.frequency === "once" ? (
                <p className="text-sm text-muted-foreground">
                  The report runs a single time, at the time above.
                </p>
              ) : (
                <Field
                  id="end"
                  label="Last day"
                  optional
                  error={errors.end}
                  hint="Runs through this day. Leave empty to repeat forever."
                  className="sm:max-w-48"
                >
                  <Input
                    {...ctl("end", true)}
                    type="date"
                    value={v.end}
                    onChange={(e) => set("end", e.target.value)}
                    disabled={submitting}
                  />
                </Field>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery</CardTitle>
              <CardDescription>Who receives the report, and how.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <Field
                id="recipients"
                label="Recipients"
                error={errors.recipients}
                hint="Up to 50. Press Enter or comma after each address, or paste a list."
              >
                <EmailChipsInput
                  id="recipients"
                  value={v.recipients}
                  onChange={(list) => set("recipients", list)}
                  placeholder="name@example.com"
                  invalid={!!errors.recipients}
                  describedBy={
                    errors.recipients ? "recipients-error" : "recipients-hint"
                  }
                  disabled={submitting}
                />
              </Field>

              <Field id="cc" label="CC" optional error={errors.cc}>
                <EmailChipsInput
                  id="cc"
                  value={v.cc}
                  onChange={(list) => set("cc", list)}
                  invalid={!!errors.cc}
                  describedBy={errors.cc ? "cc-error" : undefined}
                  disabled={submitting}
                />
              </Field>

              <Field
                id="render_format"
                label="Format"
                error={errors.render_format}
                className="sm:max-w-72"
              >
                <NativeSelect
                  {...ctl("render_format")}
                  value={v.render_format}
                  onChange={(e) =>
                    set("render_format", e.target.value as RenderFormat)
                  }
                  disabled={submitting}
                >
                  {RENDER_FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <Separator />

              <Field
                id="subject"
                label="Email subject"
                optional
                error={errors.subject}
                hint="Defaults to “@ReportName was executed at @ExecutionTime”."
              >
                <Input
                  {...ctl("subject", true)}
                  value={v.subject}
                  onChange={(e) => set("subject", e.target.value)}
                  placeholder="@ReportName was executed at @ExecutionTime"
                  autoComplete="off"
                  disabled={submitting}
                />
              </Field>

              <Field
                id="comment"
                label="Message"
                optional
                error={errors.comment}
                hint="Added to the email."
              >
                <Textarea
                  {...ctl("comment", true)}
                  value={v.comment}
                  onChange={(e) => set("comment", e.target.value)}
                  rows={2}
                  disabled={submitting}
                />
              </Field>

              <Field
                id="description"
                label="Subscription label"
                optional
                error={errors.description}
                hint="How the subscription is named in the SSRS portal."
              >
                <Input
                  {...ctl("description", true)}
                  value={v.description}
                  onChange={(e) => set("description", e.target.value)}
                  autoComplete="off"
                  disabled={submitting}
                />
              </Field>

              <div className="grid gap-3">
                <CheckField
                  label="Include a link to the report"
                  checked={v.include_link}
                  onChange={(c) => set("include_link", c)}
                  disabled={submitting}
                />
                <CheckField
                  label="Active"
                  description="Turn off to create the subscription switched off."
                  checked={v.active}
                  onChange={(c) => set("active", c)}
                  disabled={submitting}
                />
              </div>
            </CardContent>
          </Card>

          {apiError && (
            <Alert variant="destructive" role="alert">
              <AlertCircleIcon />
              <AlertTitle>
                {apiError.status === 503
                  ? "Reporting is not set up"
                  : "Could not schedule the report"}
              </AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{apiError.message}</p>
                {apiError.status === 502 && (
                  <div className="flex flex-wrap gap-2">
                    {apiError.canOverwrite ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void submit({ overwrite: true })}
                        disabled={submitting}
                      >
                        <RotateCcwIcon />
                        Retry and replace it
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void submit()}
                        disabled={submitting}
                      >
                        <RotateCcwIcon />
                        Retry
                      </Button>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2Icon className="animate-spin" />}
              {submitting ? "Scheduling..." : "Schedule report"}
            </Button>
            {submitting && (
              <p role="status" className="text-sm text-muted-foreground">
                Publishing the report and creating the subscription. This can take
                a minute or two.
              </p>
            )}
          </div>
        </>
      )}
    </form>
  )
}

function ApprovedReview({ approved }: { approved: Approved }) {
  const when = new Date(approved.approvedAt)
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {approved.ritm}
          </p>
          <p className="font-medium break-words">{approved.title}</p>
        </div>
        <Badge variant="outline">
          <CheckCircle2Icon className="text-emerald-600" />
          Approved
          {!Number.isNaN(when.getTime()) &&
            ` ${when.toLocaleDateString(undefined, { dateStyle: "medium" })}`}
        </Badge>
      </div>
      <pre className="max-h-64 overflow-auto rounded-md border bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {approved.sql}
      </pre>
      <p className="text-xs text-muted-foreground">
        This is the query that will be published. To change it, revise and
        re-approve the SQL on Generate SQL.
      </p>
      {!approved.ticketFetched && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          The ticket could not be fetched, so the title saved with the approval
          is used.
        </p>
      )}
    </div>
  )
}

function Field({
  id,
  label,
  optional,
  hint,
  error,
  className,
  children,
}: {
  id: string
  label: string
  optional?: boolean
  hint?: React.ReactNode
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional && (
          <span className="font-normal text-muted-foreground">(optional)</span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

function CheckField({
  label,
  description,
  checked,
  onChange,
  disabled,
  className,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <Label className={cn("cursor-pointer items-start", className)}>
      <Checkbox
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="mt-px"
      />
      <span className="grid gap-1">
        <span className="leading-snug">{label}</span>
        {description && (
          <span className="text-xs font-normal text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </Label>
  )
}

function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground",
        className,
      )}
      {...props}
    />
  )
}

function ToggleGroup({
  legend,
  hint,
  error,
  children,
}: {
  legend: string
  hint: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-sm leading-none font-medium">
        {legend}{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </fieldset>
  )
}

function ToggleButton({
  pressed,
  onClick,
  disabled,
  label,
  square,
  children,
}: {
  pressed: boolean
  onClick: () => void
  disabled?: boolean
  label: string
  square?: boolean
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant={pressed ? "default" : "outline"}
      size={square ? "icon-sm" : "sm"}
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(square && "tabular-nums", !square && "min-w-11")}
    >
      {children}
    </Button>
  )
}

function ColumnsEditor({
  columns,
  errors,
  disabled,
  onAdd,
  onRemove,
  onChange,
}: {
  columns: ColumnRow[]
  errors: Errors
  disabled: boolean
  onAdd: () => void
  onRemove: (uid: number) => void
  onChange: (uid: number, patch: Partial<ColumnRow>) => void
}) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm leading-none font-medium">
            Columns{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </h3>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Every column is shown as returned. Add one to change its header,
            format, alignment or width.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          disabled={disabled}
        >
          <PlusIcon />
          Customize a column
        </Button>
      </div>

      {columns.map((c, i) => {
        const id = (field: string) => `columns.${i}.${field}`
        const ctl = (field: string) => ({
          id: id(field),
          "aria-invalid": errors[id(field)] ? (true as const) : undefined,
          "aria-describedby": errors[id(field)]
            ? `${id(field)}-error`
            : undefined,
        })
        return (
          <div
            key={c.uid}
            className="grid gap-3 rounded-lg border bg-muted/30 p-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id={id("name")}
                label="Column"
                error={errors[id("name")]}
              >
                <Input
                  {...ctl("name")}
                  value={c.name}
                  onChange={(e) => onChange(c.uid, { name: e.target.value })}
                  placeholder="Alias in the SQL, e.g. Balance"
                  autoComplete="off"
                  disabled={disabled}
                  className="bg-background"
                />
              </Field>
              <Field
                id={id("header")}
                label="Header"
                optional
                error={errors[id("header")]}
              >
                <Input
                  {...ctl("header")}
                  value={c.header}
                  onChange={(e) => onChange(c.uid, { header: e.target.value })}
                  placeholder="Balance (INR)"
                  autoComplete="off"
                  disabled={disabled}
                  className="bg-background"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_6rem_auto]">
              <Field
                id={id("format")}
                label="Format"
                optional
                error={errors[id("format")]}
              >
                <Input
                  {...ctl("format")}
                  value={c.format}
                  onChange={(e) => onChange(c.uid, { format: e.target.value })}
                  placeholder="N2, C0, P1, yyyy-MM-dd"
                  autoComplete="off"
                  disabled={disabled}
                  className="bg-background"
                />
              </Field>
              <Field
                id={id("align")}
                label="Align"
                optional
                error={errors[id("align")]}
              >
                <NativeSelect
                  {...ctl("align")}
                  value={c.align}
                  onChange={(e) =>
                    onChange(c.uid, { align: e.target.value as Align | "" })
                  }
                  disabled={disabled}
                  className="bg-background"
                >
                  <option value="">Default</option>
                  {ALIGNS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                id={id("width_cm")}
                label="Width (cm)"
                optional
                error={errors[id("width_cm")]}
              >
                <Input
                  {...ctl("width_cm")}
                  type="number"
                  min={1}
                  max={20}
                  step="any"
                  value={c.width_cm}
                  onChange={(e) =>
                    onChange(c.uid, { width_cm: e.target.value })
                  }
                  disabled={disabled}
                  className="bg-background"
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove column ${c.name || i + 1}`}
                onClick={() => onRemove(c.uid)}
                disabled={disabled}
                className="justify-self-end"
              >
                <Trash2Icon />
              </Button>
            </div>
          </div>
        )
      })}
    </section>
  )
}

function Confirmation({
  ref,
  done,
  onAnother,
}: {
  ref: React.Ref<HTMLDivElement>
  done: Done
  onAnother: () => void
}) {
  const { report, subscription } = done.response
  const format = RENDER_FORMATS.find((f) => f.value === subscription.render_format)
  const safeUrl = /^https?:\/\//i.test(report.url)

  return (
    <Card>
      <CardHeader>
        <div
          ref={ref}
          tabIndex={-1}
          className="flex items-center gap-2 outline-none"
        >
          <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600" />
          <CardTitle>
            {report.created ? "Report scheduled" : "Report replaced and scheduled"}
          </CardTitle>
        </div>
        <CardDescription>
          The report is published in SSRS and the email subscription is
          {subscription.active ? " active." : " created but switched off."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-muted-foreground">Report</dt>
          <dd className="min-w-0 space-y-1">
            <p className="font-medium break-words">
              {report.report_path.split("/").pop() || report.report_path}
            </p>
            {safeUrl && (
              <a
                href={report.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              >
                Open in the SSRS portal
                <ExternalLinkIcon className="size-3.5" />
              </a>
            )}
          </dd>

          <dt className="text-muted-foreground">Ticket</dt>
          <dd>{done.ritm}</dd>

          <dt className="text-muted-foreground">Schedule</dt>
          <dd>{done.schedule}</dd>

          <dt className="text-muted-foreground">Recipients</dt>
          <dd>
            <AddressList addresses={subscription.recipients} />
          </dd>

          {done.cc.length > 0 && (
            <>
              <dt className="text-muted-foreground">CC</dt>
              <dd>
                <AddressList addresses={done.cc} />
              </dd>
            </>
          )}

          <dt className="text-muted-foreground">Format</dt>
          <dd>{format?.label ?? subscription.render_format}</dd>

          <dt className="text-muted-foreground">Columns</dt>
          <dd className="flex flex-wrap gap-1.5">
            {report.columns.map((c) => (
              <Badge key={c} variant="outline">
                {c}
              </Badge>
            ))}
          </dd>

          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge variant={subscription.active ? "default" : "secondary"}>
              {subscription.active ? "Active" : "Switched off"}
            </Badge>
          </dd>
        </dl>

        <Button variant="outline" onClick={onAnother}>
          <PlusIcon />
          Schedule another report
        </Button>
      </CardContent>
    </Card>
  )
}

function AddressList({ addresses }: { addresses: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {addresses.map((a) => (
        <li key={a} className="rounded-md bg-muted px-2 py-0.5">
          {a}
        </li>
      ))}
    </ul>
  )
}
