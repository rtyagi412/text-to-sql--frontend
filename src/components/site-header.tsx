import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 rounded-t-xl border-b bg-background/70 px-4 backdrop-blur-md transition-[width,height] ease-linear">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-2 data-vertical:h-4 data-vertical:self-center"
      />
      <span className="text-sm font-medium">Banking Reporting</span>
    </header>
  )
}
