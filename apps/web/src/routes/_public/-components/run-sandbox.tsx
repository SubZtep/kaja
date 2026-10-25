import type { PublicSandboxesResponse } from "@kaja/schema/api"
import { useQuery } from "@tanstack/react-query"
import { ContentWidth } from "../../../components/layout/content-width"
import { RunCommand } from "../../../components/sandbox/run-command"
import { useApiFetch } from "../../../lib/api-fetch"
import { m } from "../../../paraglide/messages.js"
import { SectionTitle } from "./section-title"
import { Sticker } from "./sticker"

/** The anonymous `docker run` anyone can start a shared sandbox with, and how many are online. */
export function RunSandbox() {
  const apiFetch = useApiFetch()
  const { data } = useQuery({
    queryKey: ["sandbox", "public"],
    // Typed, not parsed: a zod parse here would pull zod into the landing page
    queryFn: () => apiFetch<PublicSandboxesResponse>("/sandbox/public"),
    staleTime: 60_000
  })

  return (
    <section>
      <ContentWidth className="py-10 sm:py-16">
        <SectionTitle
          title={m.landing_sandbox_title()}
          sticker={
            data && (
              <Sticker rotate={-6} className="text-[10px]">
                {m.landing_sandbox_online({ count: data.online })}
              </Sticker>
            )
          }
        />
        <div className="grid gap-6 md:grid-cols-2 md:gap-10">
          <div className="font-crt text-muted flex flex-col gap-3 text-sm">
            <p className="m-0">{m.landing_sandbox_why()}</p>
            <p className="m-0">{m.landing_sandbox_how()}</p>
          </div>
          <div className="min-w-0">
            <RunCommand look="crt" />
          </div>
        </div>
      </ContentWidth>
    </section>
  )
}
