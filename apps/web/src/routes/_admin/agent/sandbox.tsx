import { Field } from "@base-ui/react/field"
import type { MySandboxesResponse, Sandbox, SandboxSettings } from "@kaja/schema/api"
import { mySandboxesResponseSchema, sandboxKeyResponseSchema, sandboxSettingsSchema } from "@kaja/schema/api"
import { getTimeAgo } from "@kaja/shared/date"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../../components/form/primitives/Button"
import { Checkbox } from "../../../components/form/primitives/Checkbox"
import { RunCommand } from "../../../components/sandbox/RunCommand"
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog"
import { ErrorNotice } from "../../../components/ui/ErrorNotice"
import { IconButton } from "../../../components/ui/IconButton"
import { Loader } from "../../../components/ui/Loader"
import { PageHeader } from "../../../components/ui/PageHeader"
import { Section } from "../../../components/ui/Section"
import { StatusDot } from "../../../components/ui/StatusDot"
import { useApiFetch } from "../../../lib/api-fetch"
import { userRequired } from "../../../lib/loaders"
import { hardware, place } from "../../../lib/sandbox"
import { seo } from "../../../lib/seo"
import { m } from "../../../paraglide/messages.js"

export const Route = createFileRoute("/_admin/agent/sandbox")({
  component: SandboxPage,
  loader: () => userRequired(),
  head: () => ({ meta: seo({ title: m.nav_sandbox() }) })
})

const QUERY_KEY = ["sandbox", "mine"]

function KeySection({ settings }: Readonly<{ settings: SandboxSettings }>) {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const [key, setKey] = useState<string>()
  const createKey = useMutation({
    mutationFn: () =>
      apiFetch("/sandbox/key", undefined, { method: "POST" }).then(r => sandboxKeyResponseSchema.parse(r).key),
    onSuccess: created => {
      setKey(created)
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: error => toast.error(error.message)
  })
  const button = (
    <Button type="button" disabled={createKey.isPending} onClick={() => !settings.hasKey && createKey.mutate()}>
      {settings.hasKey ? m.sandbox_key_regenerate() : m.sandbox_key_create()}
    </Button>
  )

  return (
    <Section title={m.sandbox_key_title()}>
      <p className="mb-3 text-muted text-sm">{m.sandbox_key_description()}</p>
      {key ? (
        <div className="mb-4">
          <p className="mb-2 text-fg text-sm">{m.sandbox_key_shown_once()}</p>
          <RunCommand sandboxKey={key} />
        </div>
      ) : (
        settings.keyCreatedAt && (
          <p className="mb-4 font-mono text-muted text-xs">
            {m.sandbox_key_created({ time: getTimeAgo(settings.keyCreatedAt) })}
          </p>
        )
      )}
      {settings.hasKey ? (
        <ConfirmDialog
          title={m.sandbox_key_regenerate_title()}
          description={m.sandbox_key_regenerate_description()}
          confirm={m.sandbox_key_regenerate()}
          onConfirm={() => createKey.mutate()}
        >
          {button}
        </ConfirmDialog>
      ) : (
        button
      )}
    </Section>
  )
}

function SettingsSection({ settings }: Readonly<{ settings: SandboxSettings }>) {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: (patch: Partial<Pick<SandboxSettings, "share" | "useShared">>) =>
      apiFetch("/sandbox/settings", patch, { method: "PATCH" }).then(r => sandboxSettingsSchema.parse(r)),
    onSuccess: saved =>
      queryClient.setQueryData<MySandboxesResponse>(QUERY_KEY, old => (old ? { ...old, settings: saved } : old)),
    onError: error => toast.error(error.message)
  })

  return (
    <Section title={m.sandbox_settings_title()}>
      <div className="flex flex-col gap-4">
        <Field.Root>
          <Field.Label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              className="mt-0.5 shrink-0"
              checked={settings.share}
              disabled={update.isPending}
              onCheckedChange={share => update.mutate({ share })}
            />
            <span>
              <span className="block text-fg text-sm">{m.sandbox_setting_share()}</span>
              <span className="block text-muted text-xs">{m.sandbox_setting_share_hint()}</span>
            </span>
          </Field.Label>
        </Field.Root>
        <Field.Root>
          <Field.Label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              className="mt-0.5 shrink-0"
              checked={settings.useShared}
              disabled={update.isPending}
              onCheckedChange={useShared => update.mutate({ useShared })}
            />
            <span>
              <span className="block text-fg text-sm">{m.sandbox_setting_use_shared()}</span>
              <span className="block text-muted text-xs">{m.sandbox_setting_use_shared_hint()}</span>
            </span>
          </Field.Label>
        </Field.Root>
      </div>
    </Section>
  )
}

function SandboxRow({ sandbox }: Readonly<{ sandbox: Sandbox }>) {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => apiFetch(`/sandbox/${sandbox.id}`, undefined, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: error => toast.error(error.message)
  })
  const info = sandbox.info
  const load = sandbox.load

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-border border-b py-3 last:border-b-0">
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-fg">{sandbox.name ?? m.sandbox_unnamed()}</span>
        <span className="text-muted text-sm">{place(sandbox)}</span>
        {hardware(sandbox) && <span className="font-mono text-muted text-xs">{hardware(sandbox)}</span>}
      </div>
      <div className="flex items-center gap-4">
        {sandbox.online && info && (
          <span className="font-mono text-muted text-xs">
            {m.sandbox_running({ running: load?.running ?? 0, max: info.maxProcesses })}
          </span>
        )}
        {!sandbox.online && sandbox.lastSeenAt && (
          <span className="font-mono text-muted text-xs">
            {m.sandbox_last_seen({ time: getTimeAgo(sandbox.lastSeenAt) })}
          </span>
        )}
        <StatusDot active={sandbox.online} label={sandbox.online ? m.sandbox_online() : m.sandbox_offline()} />
        {!sandbox.online && (
          <ConfirmDialog
            title={m.sandbox_remove_title()}
            description={m.sandbox_remove_description()}
            confirm={m.sandbox_remove()}
            onConfirm={() => remove.mutate()}
          >
            <IconButton variant="danger" aria-label={m.sandbox_remove()}>
              <Trash2 size={18} />
            </IconButton>
          </ConfirmDialog>
        )}
      </div>
    </div>
  )
}

/** The user's own MCP sandboxes: the key that links one to them, whether they share and use shared ones, and each sandbox's state. */
function SandboxPage() {
  const apiFetch = useApiFetch()
  const { data, error, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<MySandboxesResponse>("/sandbox").then(r => mySandboxesResponseSchema.parse(r)),
    refetchInterval: 15_000
  })

  return (
    <div className="space-y-6">
      <PageHeader title={m.sandbox_page_title()} description={m.sandbox_page_description()} />
      <ErrorNotice error={error} />
      {isLoading && <Loader />}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <KeySection settings={data.settings} />
            <SettingsSection settings={data.settings} />
          </div>
          <Section title={m.sandbox_mine_title()}>
            {data.sandboxes.length === 0 ? (
              <p className="text-muted text-sm">{m.sandbox_mine_empty()}</p>
            ) : (
              data.sandboxes.map(sandbox => <SandboxRow key={sandbox.id} sandbox={sandbox} />)
            )}
          </Section>
        </>
      )}
    </div>
  )
}
