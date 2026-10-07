import { Dialog } from "@base-ui/react/dialog"
import { Field } from "@base-ui/react/field"
import type { SaveAbilityKeyResponse } from "@kaja/schema/api"
import { saveAbilityKeyResponseSchema } from "@kaja/schema/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "react-toastify"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { Button } from "../form/primitives/Button"
import { Text } from "../form/primitives/Text"
import { DIALOG_TITLE, DialogShell } from "../ui/DialogShell"
import { ABILITY_KEYS_QUERY_KEY } from "./queries"

/**
 * Asks for an ability's API key, saves it (encrypted on the server, never shown again) and reports the server's live
 * test. A failed test keeps the dialog open so another key can be tried; the key is saved either way.
 */
export function KeyDialog({
  name,
  domain,
  open,
  onOpenChange
}: Readonly<{
  name: string
  domain: string
  open: boolean
  onOpenChange: (open: boolean) => void
}>) {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState("")
  const [failure, setFailure] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      return saveAbilityKeyResponseSchema.parse(
        await apiFetch<SaveAbilityKeyResponse>(
          `/abilities/me/keys/${encodeURIComponent(name)}`,
          { apiKey },
          { method: "PUT" }
        )
      )
    },
    onSuccess: ({ check }) => {
      queryClient.invalidateQueries({ queryKey: ABILITY_KEYS_QUERY_KEY })
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
        <DialogShell className="w-120">
          <Dialog.Title className={DIALOG_TITLE}>{m.tools_key_dialog_title({ name })}</Dialog.Title>
          <Dialog.Description className="mb-6 text-muted text-sm">
            {m.tools_key_dialog_description({ domain })}
          </Dialog.Description>
          <form
            noValidate
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
                {m.tools_key_save()}
              </Button>
            </div>
          </form>
        </DialogShell>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
