import type { CreatePersonaRequest, ListPersonasResponse, Persona, UpdatePersonaRequest } from "@kaja/schema/api"
import { personaSchema } from "@kaja/schema/api"
import { getTimeAgo } from "@kaja/shared"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { CellContext } from "@tanstack/react-table"
import { Pencil, Trash2 } from "lucide-react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "../../../components/form/primitives/Button"
import { Checkbox } from "../../../components/form/primitives/Checkbox"
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog"
import { ErrorNotice } from "../../../components/ui/ErrorNotice"
import { IconButton } from "../../../components/ui/IconButton"
import { Loader } from "../../../components/ui/Loader"
import { PageHeader } from "../../../components/ui/PageHeader"
import { Section } from "../../../components/ui/Section"
import { Table } from "../../../components/ui/Table"
import { ValueBox } from "../../../components/ui/ValueBox"
import { useApiFetch } from "../../../lib/api-fetch"
import { useAppForm } from "../../../lib/form"
import { userRequired } from "../../../lib/loaders"
import { seo } from "../../../lib/seo"
import { tableColumnHelper, type tableFeaturesConfig } from "../../../lib/table"
import { m } from "../../../paraglide/messages.js"
import { EditPersonaDialog } from "./-components/EditPersonaDialog"

export const Route = createFileRoute("/_admin/personas/")({
  component: PersonasPage,
  loader: () => userRequired("admin"),
  head: () => ({ meta: seo({ title: m.nav_personas() }) })
})

const createFormSchema = z.object({
  personaId: z
    .string()
    .min(1, m.personas_admin_validation_required())
    .regex(/^[a-z0-9][a-z0-9-_]*$/, m.personas_admin_validation_invalid_id()),
  label: z.string().min(1, m.personas_admin_validation_required()),
  when: z.string(),
  instructions: z.string(),
  sortOrder: z.string()
})

const columnHelper = tableColumnHelper<Persona>()

function PersonaIdCell(info: CellContext<typeof tableFeaturesConfig, Persona, string>) {
  return <span className="font-mono text-sm font-bold text-fg">{info.getValue()}</span>
}

function WhenCell(info: CellContext<typeof tableFeaturesConfig, Persona, string | null>) {
  const value = info.getValue()
  if (!value) return <span className="text-xs text-muted">—</span>
  return <span className="text-xs text-muted">{value}</span>
}

function makeEnabledCell(onToggle: (args: { id: string; enabled: boolean }) => void) {
  return function EnabledCell(info: CellContext<typeof tableFeaturesConfig, Persona, boolean>) {
    const persona = info.row.original
    return (
      <Checkbox
        checked={info.getValue()}
        aria-label={m.personas_admin_toggle_enabled({ personaId: persona.personaId })}
        onCheckedChange={enabled => onToggle({ id: persona.id, enabled })}
      />
    )
  }
}

function CreatedAtCell(info: CellContext<typeof tableFeaturesConfig, Persona, Date>) {
  return <span className="font-mono text-xs text-muted">{getTimeAgo(info.getValue())}</span>
}

function makeActionsCell(
  onDelete: (id: string) => void,
  onSave: (id: string, payload: UpdatePersonaRequest) => Promise<unknown>,
  isSaving: boolean
) {
  return function ActionsCell(info: { row: { original: Persona } }) {
    const persona = info.row.original
    return (
      <div className="flex justify-end gap-1">
        <EditPersonaDialog persona={persona} isPending={isSaving} onSave={payload => onSave(persona.id, payload)}>
          <IconButton aria-label={m.personas_admin_edit_title()}>
            <Pencil size={18} />
          </IconButton>
        </EditPersonaDialog>
        <ConfirmDialog
          title={m.personas_admin_delete_confirm_title()}
          description={m.personas_admin_delete_confirm_description({ personaId: persona.personaId })}
          confirm={m.personas_admin_delete_confirm_button()}
          onConfirm={() => onDelete(persona.id)}
        >
          <IconButton variant="danger" aria-label={m.personas_admin_delete_confirm_button()}>
            <Trash2 size={18} />
          </IconButton>
        </ConfirmDialog>
      </div>
    )
  }
}

function PersonasPage() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()

  const { data, error, isLoading } = useQuery({
    queryKey: ["personas"],
    queryFn: () => apiFetch<ListPersonasResponse>("/admin/personas").then(r => z.array(personaSchema).parse(r.personas))
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["personas"] })

  const createPersona = useMutation({
    mutationFn: (payload: CreatePersonaRequest) =>
      apiFetch("/admin/personas", payload).then(r => personaSchema.parse(r)),
    onSuccess: () => {
      invalidate()
      toast.success(m.personas_admin_success_created())
    },
    onError: (err: Error) => toast.error(err.message || m.personas_admin_error_create_failed())
  })

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/admin/personas/${id}`, { enabled }, { method: "PATCH" }).then(r => personaSchema.parse(r)),
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message || m.personas_admin_error_update_failed())
  })

  const updatePersona = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePersonaRequest }) =>
      apiFetch(`/admin/personas/${id}`, payload, { method: "PATCH" }).then(r => personaSchema.parse(r)),
    onSuccess: () => {
      invalidate()
      toast.success(m.personas_admin_success_updated())
    },
    onError: (err: Error) => toast.error(err.message || m.personas_admin_error_update_failed())
  })

  const deletePersona = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/personas/${id}`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      invalidate()
      toast.success(m.personas_admin_success_deleted())
    },
    onError: (err: Error) => toast.error(err.message || m.personas_admin_error_delete_failed())
  })

  const form = useAppForm({
    defaultValues: {
      personaId: "",
      label: "",
      when: "",
      instructions: "",
      sortOrder: "0"
    },
    validators: {
      onSubmit: createFormSchema
    },
    onSubmit: async ({ value, formApi }) => {
      await createPersona.mutateAsync({
        personaId: value.personaId.trim(),
        label: value.label.trim(),
        when: value.when.trim() || undefined,
        instructions: value.instructions.trim() || undefined,
        sortOrder: Number.parseInt(value.sortOrder, 10) || 0,
        enabled: true
      })
      formApi.reset()
    }
  })

  const columns = columnHelper.columns([
    columnHelper.accessor("personaId", {
      header: m.personas_admin_column_persona_id(),
      cell: PersonaIdCell
    }),
    columnHelper.accessor("label", {
      header: m.personas_admin_column_label()
    }),
    columnHelper.accessor("when", {
      header: m.personas_admin_column_when(),
      cell: WhenCell
    }),
    columnHelper.accessor("enabled", {
      header: m.personas_admin_column_enabled(),
      cell: makeEnabledCell(args => toggleEnabled.mutate(args)),
      enableColumnFilter: false
    }),
    columnHelper.accessor("createdAt", {
      header: m.personas_admin_column_created(),
      cell: CreatedAtCell,
      enableColumnFilter: false
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: makeActionsCell(
        id => deletePersona.mutate(id),
        (id, payload) => updatePersona.mutateAsync({ id, payload }),
        updatePersona.isPending
      )
    })
  ])

  if (isLoading) return <Loader />

  const personas = data ?? []
  const enabledCount = personas.filter(p => p.enabled).length

  return (
    <>
      <PageHeader
        title={m.personas_admin_title()}
        description={m.personas_admin_description()}
        meta={m.personas_admin_meta()}
      >
        <ValueBox label={m.personas_admin_total()} variant="neon">
          {personas.length}
        </ValueBox>
        <ValueBox label={m.personas_admin_enabled()}>{enabledCount}</ValueBox>
      </PageHeader>

      <ErrorNotice error={error} />

      <Section className="mb-4" title={m.personas_admin_add_title()}>
        <form
          onSubmit={e => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <form.AppField name="personaId">
            {field => <field.TextField label={m.personas_admin_field_persona_id()} placeholder="care" />}
          </form.AppField>
          <form.AppField name="label">
            {field => <field.TextField label={m.personas_admin_field_label()} placeholder="Care assistant" />}
          </form.AppField>
          <form.AppField name="when">
            {field => (
              <field.TextField label={m.personas_admin_field_when()} placeholder="the user asks about wellbeing" />
            )}
          </form.AppField>
          <form.AppField name="sortOrder">
            {field => <field.TextField label={m.personas_admin_field_sort_order()} placeholder="0" type="number" />}
          </form.AppField>
          <div className="sm:col-span-2">
            <form.AppField name="instructions">
              {field => (
                <field.TextAreaField
                  label={m.personas_admin_field_instructions()}
                  rows={6}
                  placeholder="System prompt"
                />
              )}
            </form.AppField>
          </div>
          <Button type="submit" className="justify-self-start sm:col-span-2" loading={createPersona.isPending}>
            {m.personas_admin_add_button()}
          </Button>
        </form>
      </Section>

      <Section padded={false}>
        <div className="px-5.5 py-5 sm:px-6">
          <Table columns={columns} data={personas} showFilters={false} />
        </div>
      </Section>
    </>
  )
}
