// Client for POST /report/schedule: builds the report, publishes it to SSRS and
// creates the email subscription in one call. The backend has no CORS headers,
// so the browser reaches it through the /api rewrite in next.config.ts.

export type Frequency = "daily" | "weekly" | "monthly"

export type RenderFormat =
  | "MHTML"
  | "PDF"
  | "EXCELOPENXML"
  | "CSV"
  | "WORDOPENXML"
  | "PPTX"
  | "XML"
  | "IMAGE"

export type Align = "Left" | "Center" | "Right"

export interface ScheduleReportRequest {
  sql: string
  report_name: string
  layout?: { title?: string; landscape?: boolean }
  columns?: {
    name: string
    header?: string
    format?: string
    align?: Align
    width_cm?: number
  }[]
  overwrite?: boolean
  schedule: {
    frequency: Frequency
    start: string
    end?: string
    interval?: number
    days_of_week?: string[]
    days_of_month?: number[]
  }
  recipients: string[]
  cc?: string[]
  render_format?: RenderFormat
  subject?: string
  comment?: string
  include_link?: boolean
  description?: string
  active?: boolean
}

export interface ScheduleReportResponse {
  report: {
    report_path: string
    item_id: string
    created: boolean
    url: string
    columns: string[]
  }
  subscription: {
    subscription_id: string
    report_path: string
    schedule: string
    recipients: string[]
    render_format: RenderFormat
    active: boolean
  }
}

// `detail` is a sentence for 400/409/502/503 and a list of {loc, msg} for 422.
export class ScheduleReportError extends Error {
  constructor(
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(
      typeof detail === "string" ? detail : `Request failed (${status})`,
    )
  }
}

const API_BASE = "/api"

export async function scheduleReport(
  body: ScheduleReportRequest,
): Promise<ScheduleReportResponse> {
  const res = await fetch(`${API_BASE}/report/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // Publishing and subscribing can take a while.
    signal: AbortSignal.timeout(130_000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ScheduleReportError(res.status, json?.detail)
  return json as ScheduleReportResponse
}

export type ValidationDetail = { loc: (string | number)[]; msg: string }

export function isValidationDetail(v: unknown): v is ValidationDetail[] {
  return (
    Array.isArray(v) &&
    v.every((d) => d && Array.isArray(d.loc) && typeof d.msg === "string")
  )
}

const pad = (n: number) => String(Math.abs(n)).padStart(2, "0")

// "2026-10-05T08:00" -> "2026-10-05T08:00:00+05:30". A datetime-local input has
// no offset, and the server refuses a schedule time without one.
export function withOffset(local: string): string {
  const mins = -new Date(local).getTimezoneOffset()
  return `${local}:00${mins >= 0 ? "+" : "-"}${pad(Math.trunc(Math.abs(mins) / 60))}:${pad(Math.abs(mins) % 60)}`
}

// Midnight starting the day after `date` ("YYYY-MM-DD"), as a local datetime.
export function nextDayMidnight(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  const next = new Date(y, m - 1, d + 1)
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T00:00`
}
