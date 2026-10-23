import { type EditEmailInput, editEmailSchema, editSchema } from "@kaja/schema/api"
import { getDisplayName } from "@kaja/shared/text"
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router"
import type { User } from "better-auth"
import { useState } from "react"
import { toast } from "react-toastify"
import { CodeForm } from "../../components/form/CodeForm"
import { Button } from "../../components/form/primitives/Button"
import { Avatar } from "../../components/ui/Avatar"
import { ConfirmDialog } from "../../components/ui/ConfirmDialog"
import { PageHeader } from "../../components/ui/PageHeader"
import { Section } from "../../components/ui/Section"
import { useAuthClient } from "../../hooks/auth-client"
import { authErrorMessage, validationMessage } from "../../lib/error-messages"
import { useAppForm } from "../../lib/form"
import { userRequired } from "../../lib/loaders"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"

export const Route = createFileRoute("/_admin/profile")({
  component: Profile,
  loader: () => userRequired(),
  head: () => ({ meta: seo({ title: m.nav_profile() }) })
})

function Profile() {
  const user = Route.useLoaderData()

  return (
    <div className="space-y-6">
      <PageHeader
        title={m.profile_title()}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {m.profile_signed_in_as({ email: user.email })}
            <span aria-hidden>·</span>
            {user.role === "admin" ? m.role_admin() : m.role_user()}
          </span>
        }
      />

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Section title={m.profile_edit_personal_data()}>
          <EditUser user={user} />
        </Section>
        <Section title={m.profile_change_email()}>
          <ChangeEmail email={user.email} />
        </Section>
        <Section className="sm:col-span-2" tone="danger" title={m.profile_delete_title()}>
          <DeleteAccount email={user.email} />
        </Section>
      </div>
    </div>
  )
}

/** A form's submit button: right-aligned at its natural width, and off until something changed. */
function SaveButton({ label, loading, disabled }: Readonly<{ label: string; loading: boolean; disabled: boolean }>) {
  return (
    <Button type="submit" className="mt-2 self-end pr-9 pl-4 text-sm" loading={loading} disabled={disabled}>
      {label}
    </Button>
  )
}

function EditUser({ user }: Readonly<{ user: User }>) {
  const { updateUser } = useAuthClient()
  const [loading, setLoading] = useState(false)

  const form = useAppForm({
    defaultValues: {
      name: user?.name,
      // No picture is an empty string, as "Remove picture" sets it: the schema takes no null
      image: user?.image ?? ""
    },
    validators: {
      onSubmit: editSchema
    },
    onSubmit: async ({ value }) => {
      const parsed = editSchema.safeParse(value)
      if (!parsed.success) {
        toast.error(validationMessage(parsed.error.issues[0]?.message))
        return
      }

      try {
        setLoading(true)
        const { error, data } = await updateUser(parsed.data)
        if (error) toast.error(authErrorMessage(error))
        if (data?.status) {
          toast.success(m.profile_success_user_updated())
          form.reset(parsed.data)
        }
      } catch {
        toast.error(m.error_generic())
      } finally {
        setLoading(false)
      }
    }
  })

  return (
    <form
      noValidate
      onSubmit={e => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col gap-4"
    >
      <form.Subscribe selector={state => state.values}>
        {values => (
          <div className="flex items-center gap-4">
            <Avatar
              size="lg"
              src={values.image}
              alt={values.name ?? ""}
              initials={getDisplayName({ ...user, name: values.name ?? "" })
                .charAt(0)
                .toUpperCase()}
            />
            {values.image ? (
              <Button variant="chip" onClick={() => form.setFieldValue("image", "")}>
                {m.profile_image_remove()}
              </Button>
            ) : null}
          </div>
        )}
      </form.Subscribe>
      <form.AppField name="name">
        {field => <field.TextField label={m.profile_field_name()} layout="stack" autoComplete="name" />}
      </form.AppField>
      <form.AppField name="image">
        {field => (
          <field.TextField
            label={m.profile_field_image()}
            layout="stack"
            type="url"
            placeholder="https://"
            hint={m.profile_field_image_hint()}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={state => state.isDefaultValue}>
        {unchanged => <SaveButton label={m.profile_save_changes()} loading={loading} disabled={unchanged} />}
      </form.Subscribe>
    </form>
  )
}

/** An email change in two codes: the current address's approves it, then the new address's confirms it. */
function ChangeEmail({ email }: Readonly<{ email: string }>) {
  const authClient = useAuthClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  // Set once the current address's code is on its way; `confirming` once the new address's is
  const [pending, setPending] = useState<{ newEmail: string; confirming: boolean }>()

  const sendCurrentCode = async () => {
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" })
    if (error) toast.error(authErrorMessage(error))
    return !error
  }

  const form = useAppForm({
    defaultValues: {
      newEmail: "" as EditEmailInput["newEmail"]
    },
    validators: {
      onSubmit: editEmailSchema
    },
    onSubmit: async ({ value }) => {
      const parsed = editEmailSchema.safeParse(value)
      if (!parsed.success) {
        toast.error(validationMessage(parsed.error.issues[0]?.message))
        return
      }

      try {
        setLoading(true)
        if (await sendCurrentCode()) setPending({ newEmail: parsed.data.newEmail, confirming: false })
      } catch {
        toast.error(m.error_generic())
      } finally {
        setLoading(false)
      }
    }
  })

  const approve = async (otp: string) => {
    if (!pending) return
    const { error } = await authClient.emailOtp.requestEmailChange({ newEmail: pending.newEmail, otp })
    if (error) toast.error(authErrorMessage(error))
    else setPending(current => current && { ...current, confirming: true })
  }

  const confirm = async (otp: string) => {
    if (!pending) return
    const { error } = await authClient.emailOtp.changeEmail({ newEmail: pending.newEmail, otp })
    if (error) {
      toast.error(authErrorMessage(error))
      return
    }
    toast.success(m.profile_success_email_updated())
    setPending(undefined)
    form.reset()
    await router.invalidate()
  }

  if (pending)
    return (
      <div className="flex flex-col gap-3">
        <span className="text-muted text-[13px] font-medium">
          {pending.confirming ? m.profile_email_step_new() : m.profile_email_step_current()}
        </span>
        {/* Keyed by step, so the second code starts from an empty field */}
        <CodeForm
          key={String(pending.confirming)}
          email={pending.confirming ? pending.newEmail : email}
          submit={pending.confirming ? m.profile_update_email() : m.profile_email_approve()}
          verify={pending.confirming ? confirm : approve}
          resend={pending.confirming ? undefined : sendCurrentCode}
          back={() => setPending(undefined)}
          backLabel={m.confirm_dialog_cancel()}
        />
      </div>
    )

  return (
    <form
      noValidate
      onSubmit={e => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-muted text-[13px] font-medium">{m.profile_current_email()}</span>
        <span className="text-fg">{email}</span>
      </div>
      <form.AppField name="newEmail">
        {field => (
          <field.TextField
            label={m.profile_field_new_email()}
            layout="stack"
            type="email"
            autoComplete="email"
            hint={m.profile_new_email_hint()}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={state => state.isDefaultValue}>
        {unchanged => <SaveButton label={m.auth_send_code()} loading={loading} disabled={unchanged} />}
      </form.Subscribe>
    </form>
  )
}

// Hard delete (GDPR erasure): everything the user owns cascades from the user row. Better Auth wants a recent sign-in for it.
function DeleteAccount({ email }: Readonly<{ email: string }>) {
  const { deleteUser } = useAuthClient()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const onConfirm = async () => {
    try {
      setLoading(true)
      const { error } = await deleteUser()
      if (error) {
        toast.error(error.code === "SESSION_EXPIRED" ? m.profile_delete_reauth() : authErrorMessage(error))
        return
      }
      toast.success(m.profile_delete_success())
      navigate({ to: "/", reloadDocument: true })
    } catch {
      toast.error(m.error_generic())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted m-0 text-[14.5px]">{m.profile_delete_description()}</p>
      <ConfirmDialog
        title={m.profile_delete_confirm_title()}
        description={m.profile_delete_confirm_description()}
        confirm={m.profile_delete_confirm_button()}
        typeToConfirm={email}
        onConfirm={onConfirm}
      >
        <Button className="shrink-0 text-red-400" loading={loading}>
          {m.profile_delete_button()}
        </Button>
      </ConfirmDialog>
    </div>
  )
}
