"use client"

import * as React from "react"
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  RotateCcwIcon,
  HelpCircleIcon,
  Loader2Icon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "cn"
import { approvePattern } from "@/lib/approved-patterns"
import { currentUser } from "@/lib/current-user"

type OutputField = {
  name: string
  source: string
  evidence: string
}

type FilterValue = string | number | boolean | null
type FilterOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "IN"
  | "NOT_IN"
  | "GREATER_THAN"
  | "GREATER_THAN_OR_EQUAL"
  | "LESS_THAN"
  | "LESS_THAN_OR_EQUAL"
  | "BETWEEN"
  | "CONTAINS"
  | "STARTS_WITH"
  | "ENDS_WITH"
  | "IS_NULL"
  | "IS_NOT_NULL"

type RequestedFilter = {
  field: string
  operator: FilterOperator
  value: FilterValue | FilterValue[]
  source: string
  evidence: string
}

type Clarification = {
  question: string
  reason: string
}

type Ticket = {
  number: string
  name: string
  variables: {
    output_fields: string
    report_criteria: string
    description: string
    report_usage: string
  }
}

type ExtractResponse = {
  output_fields: OutputField[]
  filters: RequestedFilter[]
  // Not shown, but /sql/map expects the extraction handed back as it is.
  assumptions: string[]
  clarifications: Clarification[]
  status: "READY" | "NEEDS_CLARIFICATION"
}

type MappedField = {
  requested: string
  table: string
  column: string
}

type MappedFilter = MappedField & {
  operator: FilterOperator
  value: FilterValue | FilterValue[]
}

type MapResponse = {
  output_fields: MappedField[]
  filters: MappedFilter[]
  // Not shown, but /sql/write expects the mapping handed back as it is.
  considerations: unknown[]
  assumptions: string[]
  clarifications: Clarification[]
  status: "READY" | "NEEDS_CLARIFICATION"
}

// What /sql/approve returns: the SQL as validated and reformatted, and where
// this approval sits in the ticket's history.
type ApproveResponse = {
  ritm_number: string
  sql: string
  tables: string[]
  warnings: unknown[]
  replaced: boolean
  version: number
  approved_at: string
  approved_by: string
}

// The generated SQL an approval was made for, so it lapses when the SQL changes.
type Approval = ApproveResponse & { forSql: string }

type SqlResponse = {
  sql: string | null
  clarifications: Clarification[]
  status: "READY" | "NEEDS_CLARIFICATION"
}

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  EQUALS: "is",
  NOT_EQUALS: "is not",
  IN: "is one of",
  NOT_IN: "is none of",
  GREATER_THAN: "is greater than",
  GREATER_THAN_OR_EQUAL: "is at least",
  LESS_THAN: "is less than",
  LESS_THAN_OR_EQUAL: "is at most",
  BETWEEN: "is between",
  CONTAINS: "contains",
  STARTS_WITH: "starts with",
  ENDS_WITH: "ends with",
  IS_NULL: "is empty",
  IS_NOT_NULL: "is not empty",
}

// Structured ticket fields are the norm, so only the unusual origins
// (description text, the requester's own clarification) get a badge.
const HIDDEN_SOURCES = new Set(["OUTPUT_FIELDS", "REPORT_CRITERIA"])

function SourceBadge({ source }: { source: string }) {
  if (HIDDEN_SOURCES.has(source)) return null
  return (
    <Badge variant="outline" className="shrink-0">
      {source}
    </Badge>
  )
}

// The backend writes relative windows as "-N UNIT", e.g. "-7 DAYS".
function formatValue(v: FilterValue): string {
  if (v === null) return ""
  const rel = typeof v === "string" && v.match(/^-(\d+)\s+([A-Za-z]+)$/)
  return rel ? `last ${rel[1]} ${rel[2].toLowerCase()}` : String(v)
}

function formatFilterValues(
  f: Pick<RequestedFilter, "operator" | "value">,
): string[] {
  if (f.operator === "IS_NULL" || f.operator === "IS_NOT_NULL") return []
  return (Array.isArray(f.value) ? f.value : [f.value])
    .map(formatValue)
    .filter(Boolean)
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = body?.detail
    throw new Error(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg: string }) => d.msg).join("; ")
          : `Request failed (${res.status})`,
    )
  }
  return res.json()
}

const fetchTicket = (ritmNumber: string) =>
  request<Ticket>(`/api/ritm/${encodeURIComponent(ritmNumber)}`)

const extractRitm = (ritmNumber: string, userInput: string) =>
  request<ExtractResponse>("/api/sql/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ritm_number: ritmNumber,
      ...(userInput && { user_input: userInput }),
    }),
  })

// Neither /sql/map nor /sql/write takes free-text context; assumptions are how
// the requester's interpretation reaches the model.
const withNotes = (assumptions: string[] | undefined, ...notes: string[]) => [
  ...(assumptions ?? []),
  ...notes.filter(Boolean).map((note) => `Requester note: ${note}`),
]

const mapColumns = (
  ritmNumber: string,
  extraction: ExtractResponse,
  note: string,
) =>
  request<MapResponse>("/api/sql/map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ritm_number: ritmNumber,
      output_fields: extraction.output_fields,
      filters: extraction.filters,
      assumptions: withNotes(extraction.assumptions, note),
    }),
  })

const writeSql = (ritmNumber: string, mapping: MapResponse, notes: string[]) =>
  request<SqlResponse>("/api/sql/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ritm_number: ritmNumber,
      output_fields: mapping.output_fields,
      filters: mapping.filters,
      // Every entry here is applied to the query, and nothing is proposed for
      // the requester to accept yet, so none are sent.
      additional_filters: [],
      considerations: mapping.considerations ?? [],
      assumptions: withNotes(mapping.assumptions, ...notes),
    }),
  })

const approveSql = (ritmNumber: string, sql: string, note: string) =>
  request<ApproveResponse>("/api/sql/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ritm_number: ritmNumber,
      sql,
      approved_by: currentUser.email,
      ...(note && { note }),
    }),
  })

function describeError(err: unknown) {
  return err instanceof TypeError
    ? "Could not reach the backend at http://localhost:8000."
    : err instanceof Error
      ? err.message
      : "Something went wrong."
}

// Pull the eye to whatever just arrived.
function reveal(el: HTMLElement | null) {
  el?.focus({ preventScroll: true })
  el?.scrollIntoView({ behavior: "smooth", block: "nearest" })
}

type Tab = "ticket" | "analysis" | "mapping" | "sql"

export function RitmExtractForm() {
  const [ritm, setRitm] = React.useState("")
  const [context, setContext] = React.useState("")
  const [ticket, setTicket] = React.useState<Ticket | null>(null)
  const [result, setResult] = React.useState<ExtractResponse | null>(null)
  const [tab, setTab] = React.useState<Tab>("ticket")
  const [loadingTicket, setLoadingTicket] = React.useState(false)
  const [analyzing, setAnalyzing] = React.useState(false)
  const [mapping, setMapping] = React.useState<MapResponse | null>(null)
  const [mapLoading, setMapLoading] = React.useState(false)
  const [mapError, setMapError] = React.useState<string | null>(null)
  const [sql, setSql] = React.useState<SqlResponse | null>(null)
  // Typed on the Mapping tab, and carried into the SQL that follows.
  const [mapContext, setMapContext] = React.useState("")
  // Typed on the SQL tab, for answering a question or fixing what went wrong.
  const [sqlContext, setSqlContext] = React.useState("")
  const [sqlLoading, setSqlLoading] = React.useState(false)
  const [sqlError, setSqlError] = React.useState<string | null>(null)
  // The reviewer's sign-off on the SQL shown; cleared whenever the SQL changes.
  // The server keeps the approved version until a newer one replaces it.
  const [approval, setApproval] = React.useState<Approval | null>(null)
  const [approving, setApproving] = React.useState(false)
  const [approveError, setApproveError] = React.useState<string | null>(null)
  // The approval reached the server but could not be kept in this browser,
  // which is where Subscribe report looks for it.
  const [approveNotStored, setApproveNotStored] = React.useState(false)
  const approveRun = React.useRef(0)
  // Ignore a response that lands after a newer run has started.
  const flowRun = React.useRef(0)
  const mapRun = React.useRef(0)
  const sqlRun = React.useRef(0)
  const ritmInputRef = React.useRef<HTMLInputElement>(null)
  const [error, setError] = React.useState<string | null>(null)
  const tabsRef = React.useRef<HTMLDivElement>(null)
  const resultRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (ticket) reveal(tabsRef.current)
  }, [ticket])
  React.useEffect(() => {
    if (result) reveal(resultRef.current)
  }, [result])

  async function onExtract(e: React.FormEvent) {
    e.preventDefault()
    const value = ritm.trim()
    if (!value) return

    const run = ++flowRun.current
    setLoadingTicket(true)
    setError(null)
    setTicket(null)
    setResult(null)
    resetMapping()
    setTab("ticket")
    try {
      const fetched = await fetchTicket(value)
      if (run === flowRun.current) setTicket(fetched)
    } catch (err) {
      if (run === flowRun.current) setError(describeError(err))
    } finally {
      if (run === flowRun.current) setLoadingTicket(false)
    }
  }

  // Back to a blank slate; anything still in flight is ignored when it lands.
  function onRestart() {
    flowRun.current++
    setRitm("")
    setContext("")
    setMapContext("")
    setSqlContext("")
    setTicket(null)
    setResult(null)
    setError(null)
    setLoadingTicket(false)
    setAnalyzing(false)
    resetMapping()
    setTab("ticket")
    ritmInputRef.current?.focus()
  }

  function resetSql() {
    sqlRun.current++
    setSql(null)
    setSqlError(null)
    setSqlLoading(false)
    clearApproval()
  }

  // Forgets this session's sign-off on screen. What the server already has
  // stays until a newer approval replaces it.
  function clearApproval() {
    approveRun.current++
    setApproval(null)
    setApproving(false)
    setApproveError(null)
    setApproveNotStored(false)
  }

  async function onApprove(note: string) {
    if (!ticket || !mapping || !sql?.sql || approving) return
    const generated = sql.sql
    const run = ++approveRun.current
    setApproving(true)
    setApproveError(null)
    setApproveNotStored(false)
    try {
      const result = await approveSql(ticket.number, generated, note)
      if (run !== approveRun.current) return
      setApproval({ ...result, forSql: generated })
      // Subscribe report reads approved queries from this browser.
      const stored = approvePattern({
        ritm: ticket.number,
        title: ticket.name,
        sql: result.sql,
        output_fields: mapping.output_fields,
        filters: mapping.filters,
        approvedAt: result.approved_at,
      })
      setApproveNotStored(!stored)
    } catch (err) {
      if (run === approveRun.current) setApproveError(describeError(err))
    } finally {
      if (run === approveRun.current) setApproving(false)
    }
  }

  function resetMapping() {
    mapRun.current++
    setMapping(null)
    setMapError(null)
    setMapLoading(false)
    resetSql()
  }

  async function runMapping(ritmNumber: string, extraction: ExtractResponse) {
    const run = ++mapRun.current
    setMapping(null)
    setMapError(null)
    setMapLoading(true)
    resetSql()
    try {
      const mapped = await mapColumns(ritmNumber, extraction, mapContext.trim())
      if (run === mapRun.current) setMapping(mapped)
    } catch (err) {
      if (run === mapRun.current) setMapError(describeError(err))
    } finally {
      if (run === mapRun.current) setMapLoading(false)
    }
  }

  async function onAnalyze() {
    if (!ticket || analyzing) return
    const run = ++flowRun.current
    setAnalyzing(true)
    setError(null)
    setResult(null)
    resetMapping()
    setTab("analysis")
    try {
      const extraction = await extractRitm(ticket.number, context.trim())
      if (run === flowRun.current) setResult(extraction)
    } catch (err) {
      if (run === flowRun.current) setError(describeError(err))
    } finally {
      if (run === flowRun.current) setAnalyzing(false)
    }
  }

  function onMap() {
    if (!ticket || !result) return
    setTab("mapping")
    if (!mapping && !mapLoading) void runMapping(ticket.number, result)
  }

  function onRemap() {
    if (ticket && result && !mapLoading) void runMapping(ticket.number, result)
  }

  // Lands on the SQL tab and starts generating, or just shows what's there.
  function onGenerateSqlFromMapping() {
    setTab("sql")
    if (!sql && !sqlLoading) void onGenerateSql()
  }

  async function onGenerateSql() {
    if (!ticket || !mapping || sqlLoading) return
    const run = ++sqlRun.current
    clearApproval()
    setSql(null)
    setSqlError(null)
    setSqlLoading(true)
    try {
      const written = await writeSql(ticket.number, mapping, [
        mapContext.trim(),
        sqlContext.trim(),
      ])
      if (run === sqlRun.current) setSql(written)
    } catch (err) {
      if (run === sqlRun.current) setSqlError(describeError(err))
    } finally {
      if (run === sqlRun.current) setSqlLoading(false)
    }
  }

  const ready = result?.status === "READY"
  const sqlBlocked = !!mapping && mapping.clarifications.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter RITM</CardTitle>
        <CardDescription>
          Look up a ticket to see what was requested, then analyze it for the
          fields and conditions the report needs.
        </CardDescription>
        {(ticket || error) && (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={onRestart}>
              <RotateCcwIcon />
              Start over
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={onExtract} className="grid gap-2">
          <Label htmlFor="ritm">RITM number</Label>
          <div className="flex gap-2">
            <Input
              ref={ritmInputRef}
              id="ritm"
              placeholder="RITM0040015"
              value={ritm}
              onChange={(e) => setRitm(e.target.value)}
              disabled={loadingTicket}
              autoComplete="off"
              autoFocus
            />
            <Button type="submit" disabled={loadingTicket || !ritm.trim()}>
              {loadingTicket && <Loader2Icon className="animate-spin" />}
              {loadingTicket ? "Extracting..." : "Extract"}
            </Button>
          </div>
        </form>
      </CardContent>

      {error && !ticket && (
        <div className="px-(--card-spacing)">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Lookup failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {ticket && (
        <>
          <Separator />
          <div
            ref={tabsRef}
            tabIndex={-1}
            className="animate-in fade-in-0 slide-in-from-bottom-1 px-(--card-spacing) outline-none duration-300"
          >
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList variant="line" className="gap-3">
                <TabsTrigger value="ticket" className="px-3">
                  Ticket
                </TabsTrigger>
                <TabsTrigger value="analysis" className="px-3">
                  Analysis
                  {analyzing && <Loader2Icon className="animate-spin" />}
                  {result && (
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 rounded-full",
                        result.status === "READY"
                          ? "bg-emerald-500"
                          : "bg-amber-500",
                      )}
                    />
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="mapping"
                  className="px-3"
                  disabled={!mapping && !mapLoading && !mapError}
                >
                  Mapping
                  {mapLoading && <Loader2Icon className="animate-spin" />}
                  {mapping && (
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full bg-emerald-500"
                    />
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="sql"
                  className="px-3"
                  disabled={!mapping || sqlBlocked}
                >
                  SQL
                  {sqlLoading && <Loader2Icon className="animate-spin" />}
                  {sql?.sql && (
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full bg-emerald-500"
                    />
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="ticket" className="space-y-5 pt-3">
                <TicketDetails ticket={ticket} />
                {!result && (
                  <Button onClick={onAnalyze} disabled={analyzing}>
                    Analyze ticket
                  </Button>
                )}
              </TabsContent>

              <TabsContent
                value="analysis"
                aria-live="polite"
                className="space-y-5 pt-3"
              >
                {analyzing && !result && <AnalysisSkeleton />}

                {error && (
                  <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>Analysis failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {result && (
                  <div ref={resultRef} tabIndex={-1} className="outline-none">
                    <ExtractResult result={result} />
                  </div>
                )}

                <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
                  <Label htmlFor="context">
                    Additional context{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Textarea
                    id="context"
                    placeholder="Answer a clarification or add anything the ticket misses, e.g. “Only include active merchants”"
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        onAnalyze()
                      }
                    }}
                    disabled={analyzing}
                    rows={2}
                    className="bg-background"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant={ready ? "outline" : "default"}
                      onClick={onAnalyze}
                      disabled={analyzing}
                    >
                      {analyzing && <Loader2Icon className="animate-spin" />}
                      {analyzing
                        ? "Analyzing..."
                        : result
                          ? "Re-analyze"
                          : "Analyze ticket"}
                    </Button>
                    {result && (
                      <Button
                        onClick={onMap}
                        disabled={!ready || analyzing || mapLoading}
                      >
                        {mapLoading && <Loader2Icon className="animate-spin" />}
                        {mapLoading
                          ? "Mapping..."
                          : mapping
                            ? "View mapping"
                            : "Map columns"}
                        {!mapLoading && <ArrowRightIcon />}
                      </Button>
                    )}
                  </div>
                  {result && !ready && (
                    <p className="text-sm text-muted-foreground">
                      Answer the questions above, then re-analyze. Columns can
                      be mapped once the ticket is ready.
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="mapping" className="space-y-5 pt-3">
                <MappingSection
                  mapping={mapping}
                  loading={mapLoading}
                  error={mapError}
                  onRetry={() =>
                    ticket && result && runMapping(ticket.number, result)
                  }
                />
                <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
                  <Label htmlFor="map-context">
                    Additional context{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Textarea
                    id="map-context"
                    placeholder="Steer the mapping and the SQL, e.g. “Use the GL balance for Balance” or “Sort by Account Number”"
                    value={mapContext}
                    onChange={(e) => setMapContext(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        onRemap()
                      }
                    }}
                    disabled={mapLoading}
                    rows={2}
                    className="bg-background"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant={mapping && !sqlBlocked ? "outline" : "default"}
                      onClick={onRemap}
                      disabled={mapLoading}
                    >
                      {mapLoading && <Loader2Icon className="animate-spin" />}
                      {mapLoading ? "Mapping..." : "Re-map columns"}
                    </Button>
                    {mapping && (
                      <Button
                        onClick={onGenerateSqlFromMapping}
                        disabled={sqlBlocked || mapLoading}
                      >
                        Generate SQL
                        <ArrowRightIcon />
                      </Button>
                    )}
                  </div>
                  {sqlBlocked && (
                    <p className="text-sm text-muted-foreground">
                      Answer the questions above, then re-map. SQL can be
                      generated once the mapping is ready.
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent
                value="sql"
                aria-live="polite"
                className="space-y-5 pt-3"
              >
                {sqlLoading && <Skeleton className="h-32 w-full" aria-hidden />}

                {sqlError && (
                  <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertTitle>SQL generation failed</AlertTitle>
                    <AlertDescription>{sqlError}</AlertDescription>
                  </Alert>
                )}

                {sql && (
                  <>
                    <ClarificationList clarifications={sql.clarifications} />
                    {sql.sql && (
                      <SqlBlock
                        sql={
                          approval?.forSql === sql.sql ? approval.sql : sql.sql
                        }
                      />
                    )}
                    {sql.sql && sql.status === "READY" && (
                      <ApprovalBar
                        approval={
                          approval?.forSql === sql.sql ? approval : null
                        }
                        approving={approving}
                        error={approveError}
                        notStored={approveNotStored}
                        disabled={sqlLoading}
                        onApprove={onApprove}
                      />
                    )}
                  </>
                )}

                <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
                  <Label htmlFor="sql-context">
                    Additional context{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Textarea
                    id="sql-context"
                    placeholder="Answer a question, describe what went wrong, or say what to change, e.g. “Exclude closed accounts”"
                    value={sqlContext}
                    onChange={(e) => setSqlContext(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        void onGenerateSql()
                      }
                    }}
                    disabled={sqlLoading}
                    rows={2}
                    className="bg-background"
                  />
                  <Button
                    className="justify-self-start"
                    variant={sql ? "outline" : "default"}
                    onClick={onGenerateSql}
                    disabled={sqlLoading || !mapping}
                  >
                    {sqlLoading && <Loader2Icon className="animate-spin" />}
                    Regenerate SQL
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </>
      )}
    </Card>
  )
}

function AnalysisSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-7 w-20" />
      </div>
    </div>
  )
}

const TICKET_FIELDS: { key: keyof Ticket["variables"]; label: string }[] = [
  { key: "output_fields", label: "Output fields" },
  { key: "report_criteria", label: "Report criteria" },
  { key: "description", label: "Description" },
  { key: "report_usage", label: "Report usage" },
]

function TicketDetails({ ticket }: { ticket: Ticket }) {
  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">
          {ticket.number}
        </p>
        <h2 className="font-heading text-base leading-snug font-medium">
          {ticket.name}
        </h2>
      </div>
      <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-[8rem_1fr]">
        {TICKET_FIELDS.map(({ key, label }) => (
          <React.Fragment key={key}>
            <dt className="text-muted-foreground sm:pt-px">{label}</dt>
            <dd className="leading-relaxed whitespace-pre-wrap">
              {ticket.variables[key]?.trim() || (
                <span className="text-muted-foreground">Not provided</span>
              )}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  )
}

function SectionLabel({
  children,
  count,
}: {
  children: React.ReactNode
  count?: number
}) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
      {count !== undefined && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none tabular-nums">
          {count}
        </span>
      )}
    </h3>
  )
}

function ClarificationList({
  clarifications,
}: {
  clarifications: Clarification[]
}) {
  if (clarifications.length === 0) return null
  return (
    <section className="space-y-2">
      <SectionLabel count={clarifications.length}>
        Needs your input
      </SectionLabel>
      <ul className="space-y-2">
        {clarifications.map((c, i) => (
          <li
            key={i}
            className="space-y-0.5 rounded-md border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 text-sm"
          >
            <p className="font-medium">{c.question}</p>
            <p className="text-muted-foreground">{c.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

type MappedRow = MappedField & { filter?: MappedFilter }

// Fields first, then the columns the filters constrain, in the order returned.
function mappedRows(mapping: MapResponse): MappedRow[] {
  return [
    ...mapping.output_fields,
    ...mapping.filters.map((f) => ({ ...f, filter: f })),
  ]
}

const MAPPED_GRID =
  "sm:grid sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)] sm:gap-x-4"

function MappingSection({
  mapping,
  loading,
  error,
  onRetry,
}: {
  mapping: MapResponse | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const rows = mapping ? mappedRows(mapping) : []

  return (
    <section className="space-y-3">
      <SectionLabel count={mapping ? rows.length : undefined}>
        Mapped columns
      </SectionLabel>

      {loading && (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Column mapping failed</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {mapping && (
        <>
          <ClarificationList clarifications={mapping.clarifications} />
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No columns found.</p>
          ) : (
            <div className="rounded-md border text-sm">
              <div
                className={cn(
                  MAPPED_GRID,
                  "hidden border-b bg-muted/40 px-3 py-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid",
                )}
              >
                <span>Table</span>
                <span>Column</span>
                <span>Requested as</span>
              </div>
              <ul className="divide-y">
                {rows.map((row, i) => (
                  <li
                    key={i}
                    className={cn(
                      MAPPED_GRID,
                      "flex flex-col gap-1 px-3 py-2 sm:items-center",
                    )}
                  >
                    <code className="font-mono text-xs break-all">
                      {row.table}
                    </code>
                    <code className="font-mono text-xs font-medium break-all">
                      {row.column}
                    </code>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                      {row.requested}
                      {row.filter && <MappedFilterValue filter={row.filter} />}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function ApprovalBar({
  approval,
  approving,
  error,
  notStored,
  disabled,
  onApprove,
}: {
  approval: Approval | null
  approving: boolean
  error: string | null
  notStored: boolean
  disabled: boolean
  onApprove: (note: string) => void
}) {
  const [note, setNote] = React.useState("")

  if (approval) {
    const when = new Date(approval.approved_at)
    const warnings = approval.warnings.map((w) =>
      typeof w === "string" ? w : JSON.stringify(w),
    )
    return (
      <div className="space-y-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
          Approved
          <Badge variant="outline">Version {approval.version}</Badge>
          <span className="font-normal text-muted-foreground">
            by {approval.approved_by}
            {!Number.isNaN(when.getTime()) && ` on ${when.toLocaleString()}`}
            {approval.replaced && ", replacing the earlier approval"}
          </span>
        </p>
        <p className="text-muted-foreground">
          The reformatted SQL above is what was saved. This ticket can now be
          scheduled on Subscribe report.
        </p>
        {approval.tables.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Tables
            </span>
            {approval.tables.map((t) => (
              <code
                key={t}
                className="rounded bg-background px-1.5 py-0.5 text-xs"
              >
                {t}
              </code>
            ))}
          </div>
        )}
        {warnings.length > 0 && (
          <ul className="space-y-1.5">
            {warnings.map((w, i) => (
              <li
                key={i}
                className="rounded-md border-l-2 border-amber-500 bg-amber-500/10 px-3 py-1.5"
              >
                {w}
              </li>
            ))}
          </ul>
        )}
        {notStored && (
          <p role="alert" className="text-destructive">
            Approved, but this browser could not keep a copy, so Subscribe
            report will not find it here. Browser storage may be blocked.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-1.5">
        <Label htmlFor="approve-note">
          Reviewer note{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="approve-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Checked the joins against the ticket"
          disabled={approving}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => onApprove(note.trim())}
          disabled={disabled || approving}
        >
          {approving ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
          {approving ? "Approving..." : "Approve SQL"}
        </Button>
        <p className="text-sm text-muted-foreground">
          Happy with it? Approving records it against the ticket so its report
          can be scheduled.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Could not approve: {error}
        </p>
      )}
    </div>
  )
}

function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked; the SQL stays selectable.
    }
  }

  return (
    <div className="relative rounded-md border bg-muted/40">
      <Button
        variant="outline"
        size="sm"
        onClick={copy}
        className="absolute top-2 right-2 bg-background"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <pre className="overflow-x-auto p-3 pr-24 font-mono text-xs leading-relaxed">
        {sql}
      </pre>
    </div>
  )
}

function MappedFilterValue({ filter }: { filter: MappedFilter }) {
  const values = formatFilterValues(filter)
  return (
    <>
      <Badge variant="outline">Filter</Badge>
      <span className="text-muted-foreground">
        {OPERATOR_LABELS[filter.operator] ?? filter.operator}
      </span>
      {values.map((v, j) => (
        <React.Fragment key={j}>
          {j > 0 && (
            <span className="text-muted-foreground">
              {filter.operator === "BETWEEN" ? "and" : ","}
            </span>
          )}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{v}</code>
        </React.Fragment>
      ))}
    </>
  )
}

function ExtractResult({ result }: { result: ExtractResponse }) {
  const ready = result.status === "READY"

  const clarifications = (
    <ClarificationList clarifications={result.clarifications} />
  )

  const fields = (
    <section className="space-y-2">
      <SectionLabel count={result.output_fields.length}>
        Output fields
      </SectionLabel>
      {result.output_fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">No output fields.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {result.output_fields.map((field) => {
            const quote =
              field.evidence &&
              field.evidence.trim().toLowerCase() !==
                field.name.trim().toLowerCase()
                ? field.evidence
                : undefined
            return (
              <li
                key={field.name}
                title={quote && `Ticket: “${quote}”`}
                className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-sm"
              >
                <span className="font-medium">{field.name}</span>
                <SourceBadge source={field.source} />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )

  const filters = (
    <section className="space-y-2">
      <SectionLabel count={result.filters.length}>Filters</SectionLabel>
      {result.filters.length === 0 ? (
        <p className="text-sm text-muted-foreground">No filters.</p>
      ) : (
        <ul className="space-y-2">
          {result.filters.map((f, i) => {
            const values = formatFilterValues(f)
            return (
              <li
                key={i}
                className="space-y-0.5 rounded-md border bg-muted/40 px-3 py-2 text-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="min-w-0 leading-relaxed">
                    <span className="font-medium">{f.field}</span>{" "}
                    <span className="text-muted-foreground">
                      {OPERATOR_LABELS[f.operator] ?? f.operator}
                    </span>{" "}
                    {values.map((v, j) => (
                      <React.Fragment key={j}>
                        {j > 0 && (
                          <span className="text-muted-foreground">
                            {f.operator === "BETWEEN" ? " and " : ", "}
                          </span>
                        )}
                        <code className="rounded bg-background px-1.5 py-0.5 text-xs">
                          {v}
                        </code>
                      </React.Fragment>
                    ))}
                  </p>
                  <SourceBadge source={f.source} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        {ready ? (
          <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600" />
        ) : (
          <HelpCircleIcon className="size-5 shrink-0 text-amber-500" />
        )}
        <Badge variant={ready ? "default" : "secondary"}>{result.status}</Badge>
      </div>

      {/* Anything that needs an answer comes first */}
      {clarifications}
      {fields}
      {filters}
    </div>
  )
}
