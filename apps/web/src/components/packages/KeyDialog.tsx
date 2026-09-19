import { Dialog } from "@base-ui/react/dialog"
import { Field } from "@base-ui/react/field"
import type { KeyedPackageType, SavePackageKeyResponse } from "@kaja/schema/api"
import { savePackageKeyResponseSchema } from "@kaja/schema/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "react-toastify"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { Button } from "../form/primitives/Button"
import { Text } from "../form/primitives/Text"
import { MY_PACKAGES_QUERY_KEY } from "./queries"

/**
 * Asks for an HTTP tool's or MCP server's API key, saves it (encrypted on the server, never shown again) and reports the
 * server's live test. With `enableAfter` the tool is turned on once the key works (or has no test); a
 * failed test keeps the dialog open so another key can be tried. The key is saved either way.
 */
export function KeyDialog({
  type,
  name,
  domain,
  open,
  onOpenChange,
  enableAfter = false
}: Readonly<{
  type: KeyedPackageType
  name: string
  domain: string
  open: boolean
  onOpenChange: (open: boolean) => void
  enableAfter?: boolean
}>) {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState("")
  const [failure, setFailure] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      const result = savePackageKeyResponseSchema.parse(
        await apiFetch<SavePackageKeyResponse>(
          `/packages/me/${type}/${encodeURIComponent(name)}/key`,
          { apiKey },
          { method: "PUT" }
        )
      )
      const works = result.check === null || result.check.ok
      if (works && enableAfter) {
        await apiFetch(`/packages/me/${type}/${encodeURIComponent(name)}`, undefined, { method: "PUT" })
      }
      return result
    },
    onSuccess: ({ check }) => {
      queryClient.invalidateQueries({ queryKey: MY_PACKAGES_QUERY_KEY })
      if (check && !check.ok) {
        setFailure(m.tools_key_check_failed({ reason: check.reason ?? "" }))
        return
      }
      toast.success(check ? m.tools_key_works({ name }) : m.tools_key_untested({ name }))
      close(false)
    },
    onError: (err: Error) => setFailure(err.message || m.tools_key_error())
  })

  // Forget the typed key whenever the dialog closes, so it never lingers in memory or reappears.
  const close = (next: boolean) => {
    if (!next) {
      setApiKey("")
      setFailure(null)
    }
    onOpenChange(next)
  }

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 min-h-dvh bg-black opacity-70 transition-all duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 max-h-[calc(100dvh-4rem)] w-[30rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-6 text-fg outline-none transition-all duration-150 data-ending-style:scale-90 data-ending-style:opacity-0 data-starting-style:scale-90 data-starting-style:opacity-0">
          <Dialog.Title className="-mt-1.5 mb-1 font-bold text-fg text-lg">
            {m.tools_key_dialog_title({ name })}
          </Dialog.Title>
          <Dialog.Description className="mb-6 text-muted text-sm">
            {m.tools_key_dialog_description({ domain })}
          </Dialog.Description>
          <form
            onSubmit={e => {
              e.preventDefault()
              if (apiKey.trim()) save.mutate()
            }}
            className="grid gap-4"
          >
            <Field.Root>
              <div className="flex flex-col gap-1.5">
                <Field.Label className="font-medium text-[13px] text-muted">{m.tools_key_field()}</Field.Label>
                <Text
                  variant="3d"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  onChange={e => {
                    setApiKey(e.target.value)
                    setFailure(null)
                  }}
                />
              </div>
            </Field.Root>
            {failure && <p className="m-0 text-red-400 text-sm">{failure}</p>}
            <div className="flex justify-end gap-4">
              <Dialog.Close render={<Button type="button" />}>{m.confirm_dialog_cancel()}</Dialog.Close>
              <Button type="submit" variant="primary" loading={save.isPending} disabled={!apiKey.trim()}>
                {enableAfter ? m.tools_key_save_enable() : m.tools_key_save()}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
