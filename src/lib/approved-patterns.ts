// Approved SQL, kept per ticket so it can be reused as a pattern for later
// queries. Browser-local for now: the backend has no endpoint for this yet, so
// swap these functions for API calls when it does.

export type ApprovedPattern = {
  ritm: string
  title: string
  sql: string
  // The reviewed mapping the SQL was written from.
  output_fields: { requested: string; table: string; column: string }[]
  filters: {
    requested: string
    table: string
    column: string
    operator: string
    value: unknown
  }[]
  approvedAt: string
}

const KEY = "approved-sql-patterns"

export function listApprovedPatterns(): ApprovedPattern[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(patterns: ApprovedPattern[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(patterns))
    return true
  } catch {
    return false
  }
}

// One pattern per ticket; approving again replaces the earlier one.
export function approvePattern(pattern: ApprovedPattern): boolean {
  const others = listApprovedPatterns().filter((p) => p.ritm !== pattern.ritm)
  return save([pattern, ...others])
}

export function revokePattern(ritm: string): boolean {
  return save(listApprovedPatterns().filter((p) => p.ritm !== ritm))
}
