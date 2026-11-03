import type { ImageOrphanKind, ImageOrphansResponse } from "@kaja/schema/api"
import { imageOrphansResponseSchema, removeOrphansResponseSchema } from "@kaja/schema/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Search, Trash2 } from "lucide-react"
import { toast } from "react-toastify"
import { Button } from "../../../../../components/form/primitives/button"
import { ConfirmDialog } from "../../../../../components/ui/confirm-dialog"
import { Section } from "../../../../../components/ui/section"
import { useApiFetch } from "../../../../../lib/api-fetch"
import { formatBytes } from "../../../../../lib/sandbox"
import { m } from "../../../../../paraglide/messages.js"

const KINDS: { kind: ImageOrphanKind; title: () => string; note: () => string }[] = [
  { kind: "objects", title: () => m.storage_orphans_objects(), note: () => m.storage_orphans_objects_note() },
  { kind: "rows", title: () => m.storage_orphans_rows(), note: () => m.storage_orphans_rows_note() },
  { kind: "unsaved", title: () => m.storage_orphans_unsaved(), note: () => m.storage_orphans_unsaved_note() }
]

/** The images bucket's orphans: scanned when asked (it lists the bucket), each kind removable on its own. */
export function StorageSection() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const scan = useMutation({
    mutationKey: ["admin-image-orphans"],
    mutationFn: () =>
      apiFetch<ImageOrphansResponse>("/admin/images/orphans").then(r => imageOrphansResponseSchema.parse(r)),
    onError: (err: Error) => toast.error(err.message || m.storage_scan_failed())
  })
  const remove = useMutation({
    mutationFn: (kind: ImageOrphanKind) =>
      apiFetch(`/admin/images/orphans/${kind}`, undefined, { method: "DELETE" }).then(r =>
        removeOrphansResponseSchema.parse(r)
      ),
    onSuccess: ({ removed }) => {
      toast.success(m.storage_removed({ count: removed }))
      void queryClient.invalidateQueries({ queryKey: ["admin-images"] })
      scan.mutate()
    },
    onError: (err: Error) => toast.error(err.message || m.storage_remove_failed())
  })

  return (
    <Section className="mt-6" title={m.storage_title()}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted m-0 text-sm">{m.storage_description()}</p>
        <Button variant="secondary" size="sm" loading={scan.isPending} onClick={() => scan.mutate()}>
          <Search size={14} className="mr-1.5" />
          {m.storage_scan()}
        </Button>
      </div>
      {scan.data && (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {KINDS.map(({ kind, title, note }) => {
            const found = scan.data[kind]
            return (
              <div key={kind} className="paper-card flex flex-col gap-2 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-fg text-sm font-semibold">{title()}</span>
                  <span className="text-muted font-mono text-xs">
                    {found.count} · {formatBytes(found.bytes)}
                  </span>
                </div>
                <p className="text-muted m-0 text-xs">{note()}</p>
                {found.examples.length > 0 && (
                  <details className="text-muted text-xs">
                    <summary className="cursor-pointer">{m.storage_examples()}</summary>
                    <ul className="m-0 mt-1 list-none p-0 font-mono break-all">
                      {found.examples.map(key => (
                        <li key={key}>{key}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {found.count > 0 && (
                  <ConfirmDialog
                    title={m.storage_remove_title({ kind: title() })}
                    description={m.storage_remove_description()}
                    confirm={m.storage_remove()}
                    onConfirm={() => remove.mutate(kind)}
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={remove.isPending}
                      className="mt-1 gap-1.5 self-start text-red-400"
                    >
                      <Trash2 size={14} />
                      {m.storage_remove()}
                    </Button>
                  </ConfirmDialog>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}
