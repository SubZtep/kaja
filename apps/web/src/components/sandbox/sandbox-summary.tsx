import { Link } from "@tanstack/react-router"
import { Box } from "lucide-react"
import { useMySandboxes } from "../../hooks/sandboxes"
import { m } from "../../paraglide/messages.js"
import { Loader } from "../ui/loader"

/** How many of the user's own sandboxes are online, with the way to the Sandbox page. */
export function SandboxSummary() {
  const mine = useMySandboxes()

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
      <Link to="/sandboxes" className="text-muted hover:text-fg text-xs underline-offset-2 hover:underline">
        {m.sandbox_summary_manage()}
      </Link>
    </div>
  )
}
