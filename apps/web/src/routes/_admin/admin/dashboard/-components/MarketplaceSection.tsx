import type { MarketplaceSyncResult, MarketplaceSyncStatus } from "@kaja/schema/api"
import { marketplaceSyncResultSchema, marketplaceSyncStatusSchema } from "@kaja/schema/api"
import { getTimeAgo } from "@kaja/shared/date"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import { toast } from "react-toastify"
import { ApiKeys } from "../../../../../components/abilities/ApiKeys"
import { invalidateAbilityKeys } from "../../../../../components/abilities/queries"
import { Button } from "../../../../../components/form/primitives/Button"
import { Section } from "../../../../../components/ui/Section"
import { useApiFetch } from "../../../../../lib/api-fetch"
import { m } from "../../../../../paraglide/messages.js"

/** The last marketplace sync and a button to run one now (forced, so a new API build re-reads an unmoved branch). */
export function MarketplaceSection() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: ["abilities", "sync"],
    queryFn: () =>
      apiFetch<MarketplaceSyncStatus>("/admin/abilities/sync").then(r => marketplaceSyncStatusSchema.parse(r))
  })
  const sync = useMutation({
    mutationFn: () =>
      apiFetch<MarketplaceSyncResult>("/admin/abilities/sync?force=true", undefined, { method: "POST" }).then(r =>
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
      queryClient.invalidateQueries({ queryKey: ["abilities", "sync"] })
      invalidateAbilityKeys(queryClient)
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

/** The server-wide ability keys every user without their own shares; calls with one go only through the official sandbox. */
export function ServiceKeysSection() {
  return (
    <Section className="mb-6" title={m.service_keys_title()}>
      <p className="mt-0 mb-4 text-muted text-sm">{m.service_keys_description()}</p>
      <ApiKeys scope="service" />
    </Section>
  )
}
