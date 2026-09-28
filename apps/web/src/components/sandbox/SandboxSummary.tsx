import { mySandboxesResponseSchema } from "@kaja/schema/api"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Box } from "lucide-react"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { Loader } from "../ui/Loader"

/** How many of the user's own sandboxes are online, with the way to the Sandbox page. */
export function SandboxSummary() {
  const apiFetch = useApiFetch()
  const mine = useQuery({
    queryKey: ["sandbox", "mine"],
    queryFn: () => apiFetch("/sandbox").then(r => mySandboxesResponseSchema.parse(r))
  })

  if (mine.isLoading) return <Loader slim />
  const sandboxes = mine.data?.sandboxes ?? []
  const online = sandboxes.filter(sandbox => sandbox.online).length
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="m-0 flex items-center gap-2 text-sm">
        <Box size={16} className={online > 0 ? "text-neon" : "text-muted"} aria-hidden />
        <span className="text-fg">
          {sandboxes.length === 0 ? m.sandbox_summary_none() : m.sandbox_summary({ online, count: sandboxes.length })}
        </span>
      </p>
      <Link to="/agent/sandbox" className="text-muted text-xs underline-offset-2 hover:text-fg hover:underline">
        {m.sandbox_summary_manage()}
      </Link>
    </div>
  )
}
