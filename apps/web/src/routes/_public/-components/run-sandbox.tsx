import { publicSandboxesResponseSchema } from "@kaja/schema/api"
import { useQuery } from "@tanstack/react-query"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { useApiFetch } from "../../../lib/api-fetch"
import { runCommand } from "../../../lib/sandbox"
import { m } from "../../../paraglide/messages.js"
import { Sticker } from "./sticker"

/** The anonymous `docker run` anyone can start a shared sandbox with, and how many are online. */
export function RunSandbox() {
  const apiFetch = useApiFetch()
  const { data } = useQuery({
    queryKey: ["sandbox", "public"],
    queryFn: () => apiFetch("/sandbox/public").then(r => publicSandboxesResponseSchema.parse(r)),
    staleTime: 60_000
  })

  return (
    <section>
      <ContentWidth className="py-10 sm:py-16">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="m-0 font-display font-extrabold text-fg text-3xl md:text-4xl">{m.landing_sandbox_title()}</h2>
          {data && (
            <Sticker rotate={-6} className="text-[10px]">
              {m.landing_sandbox_online({ count: data.online })}
            </Sticker>
          )}
        </div>
        <p className="mb-6 max-w-2xl font-crt text-muted text-sm">{m.landing_sandbox_body()}</p>
        <div className="crt-frame px-4 py-5">
          <code className="block overflow-x-auto whitespace-nowrap font-crt text-neon text-sm">{runCommand()}</code>
        </div>
      </ContentWidth>
    </section>
  )
}
