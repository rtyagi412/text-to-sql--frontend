"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { cn } from "cn"

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

export const isEmail = (s: string) => EMAIL.test(s)

type Props = {
  id: string
  value: string[]
  onChange: (value: string[]) => void
  max?: number
  placeholder?: string
  invalid?: boolean
  describedBy?: string
  disabled?: boolean
}

// Addresses become chips on Enter, comma, space, semicolon, paste or blur.
export function EmailChipsInput({
  id,
  value,
  onChange,
  max = 50,
  placeholder,
  invalid,
  describedBy,
  disabled,
}: Props) {
  const [draft, setDraft] = React.useState("")
  const [draftError, setDraftError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Adds every valid address in `raw`; whatever is left stays in the input.
  function commit(raw: string) {
    const tokens = raw.split(/[\s,;]+/).filter(Boolean)
    if (tokens.length === 0) {
      setDraft("")
      setDraftError(null)
      return
    }

    const next = [...value]
    const rejected: string[] = []
    let error: string | null = null
    for (const token of tokens) {
      if (!isEmail(token)) {
        rejected.push(token)
        error = `“${token}” is not a valid email address.`
      } else if (!next.some((a) => a.toLowerCase() === token.toLowerCase())) {
        if (next.length >= max) {
          rejected.push(token)
          error = `At most ${max} addresses.`
        } else {
          next.push(token)
        }
      }
    }
    if (next.length !== value.length) onChange(next)
    setDraft(rejected.join(" "))
    setDraftError(error)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (["Enter", ",", ";", " ", "Tab"].includes(e.key)) {
      if (!draft.trim()) {
        // Enter must never submit the form from here.
        if (e.key === "Enter") e.preventDefault()
        return
      }
      if (e.key !== "Tab") e.preventDefault()
      commit(draft)
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="grid gap-1.5">
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
          (invalid || draftError) &&
            "border-destructive ring-3 ring-destructive/20 focus-within:border-destructive focus-within:ring-destructive/20",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {value.map((address) => (
          <span
            key={address}
            className="flex items-center gap-1 rounded-md bg-muted py-0.5 pr-0.5 pl-2 text-sm"
          >
            {address}
            <button
              type="button"
              aria-label={`Remove ${address}`}
              onClick={(e) => {
                e.stopPropagation()
                onChange(value.filter((a) => a !== address))
                inputRef.current?.focus()
              }}
              className="rounded-sm p-0.5 text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="email"
          autoComplete="off"
          value={draft}
          placeholder={value.length === 0 ? placeholder : undefined}
          disabled={disabled}
          aria-invalid={invalid || !!draftError ? true : undefined}
          aria-describedby={
            [describedBy, draftError ? `${id}-draft-error` : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onChange={(e) => {
            setDraft(e.target.value)
            setDraftError(null)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text")
            if (/[\s,;]/.test(text.trim())) {
              e.preventDefault()
              commit(`${draft} ${text}`)
            }
          }}
          className="min-w-40 flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
        />
      </div>
      {draftError && (
        <p id={`${id}-draft-error`} role="alert" className="text-sm text-destructive">
          {draftError}
        </p>
      )}
    </div>
  )
}
