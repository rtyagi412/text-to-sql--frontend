import { RitmExtractForm } from "@/components/ritm-extract-form"

export default function GenerateSqlPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 md:px-8">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold">Generate SQL</h1>
        <p className="text-muted-foreground">
          Turn a ticket into a reviewed SQL query: look it up, analyze it, map
          the columns, then generate.
        </p>
      </div>
      <RitmExtractForm />
    </div>
  )
}
