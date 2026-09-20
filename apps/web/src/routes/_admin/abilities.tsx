import type { MarketplaceSyncResult, MarketplaceSyncStatus } from "@kaja/schema/api"
import { marketplaceSyncResultSchema, marketplaceSyncStatusSchema } from "@kaja/schema/api"
import { getTimeAgo } from "@kaja/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { RefreshCw } from "lucide-react"
import { toast } from "react-toastify"
import { z } from "zod"
import { AbilityTabs } from "../../components/abilities/AbilityTabs"
import {
  CATALOG_QUERY_KEY,
  MY_ABILITIES_QUERY_KEY,
  useCatalog,
  useMyAbilities
} from "../../components/abilities/queries"
import { Button } from "../../components/form/primitives/Button"
import { PageHeader } from "../../components/ui/PageHeader"
import { Section } from "../../components/ui/Section"
import { ValueBox } from "../../components/ui/ValueBox"
import { useUser } from "../../hooks/user"
import { useApiFetch } from "../../lib/api-fetch"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"

export const Route = createFileRoute("/_admin/abilities")({
  validateSearch: z.object({ tab: z.enum(["skills", "personas", "tools"]).optional() }),
  component: AbilitiesPage,
  head: () => ({ meta: seo({ title: m.nav_abilities() }) })
})

/** Admins only: the last marketplace sync and a button to run one now. */
function MarketplaceSyncPanel() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: ["abilities", "sync"],
    queryFn: () =>
      apiFetch<MarketplaceSyncStatus>("/admin/abilities/sync").then(r => marketplaceSyncStatusSchema.parse(r))
  })
  const sync = useMutation({
    mutationFn: () =>
      apiFetch<MarketplaceSyncResult>("/admin/abilities/sync", undefined, { method: "POST" }).then(r =>
        marketplaceSyncResultSchema.parse(r)
      ),
    onSuccess: result => {
      const commit = result.commit.slice(0, 7)
      toast.success(
        result.changed
          ? m.skills_sync_done({
              commit,
              added: result.added.length,
              updated: result.updated.length,
              removed: result.removed.length
            })
          : m.skills_sync_unchanged({ commit })
      )
    },
    onError: (err: Error) => toast.error(err.message || m.skills_sync_failed()),
    onSettled: () => {
      for (const queryKey of [["abilities", "sync"], CATALOG_QUERY_KEY, MY_ABILITIES_QUERY_KEY]) {
        queryClient.invalidateQueries({ queryKey })
      }
    }
  })

  const data = status.data
  return (
    <Section className="mb-6" title={m.skills_sync_title()}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-muted text-xs">
          <p className="m-0">
            {data?.commit && data.syncedAt
              ? m.skills_sync_status({ time: getTimeAgo(data.syncedAt), commit: data.commit.slice(0, 7) })
              : m.skills_sync_never()}
          </p>
          {data?.error && <p className="m-0 mt-1 text-red-400">{m.skills_sync_error({ error: data.error })}</p>}
        </div>
        <Button variant="secondary" size="sm" loading={sync.isPending} onClick={() => sync.mutate()}>
          <RefreshCw size={14} className="mr-1.5" />
          {m.skills_sync_button()}
        </Button>
      </div>
    </Section>
  )
}

function AbilitiesPage() {
  const user = useUser()
  const { tab = "skills" } = Route.useSearch()
  const navigate = useNavigate({ from: "/abilities" })
  const catalog = useCatalog()
  const mine = useMyAbilities()
  const enabledCount = (mine.data?.abilities ?? []).filter(p => p.available).length

  return (
    <>
      <PageHeader title={m.abilities_title()} description={m.abilities_description()}>
        <ValueBox label={m.skills_available()} variant="neon">
          {catalog.data?.length ?? 0}
        </ValueBox>
        <ValueBox label={m.skills_enabled()}>{enabledCount}</ValueBox>
      </PageHeader>
      {user?.role === "admin" && <MarketplaceSyncPanel />}
      <AbilityTabs personas tab={tab} onTabChange={next => navigate({ search: { tab: next }, replace: true })} />
    </>
  )
}
