import { ScheduleReportForm } from "@/components/schedule-report-form"

export default function SubscribeReportPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 md:px-8">
      <div className="space-y-1.5">
        <h1 className="text-3xl font-semibold">Subscribe report</h1>
        <p className="text-muted-foreground">
          Enter an approved RITM, say who should get its report and when. The
          approved query is published to SSRS and emailed on your schedule.
        </p>
      </div>
      <ScheduleReportForm />
    </div>
  )
}
