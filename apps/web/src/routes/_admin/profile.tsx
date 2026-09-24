import { changePasswordSchema, type EditEmailInput, editEmailSchema, editSchema } from "@kaja/schema/api"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type { User } from "better-auth"
import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../components/form/primitives/Button"
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
        description={m.profile_description_logged_in_as({
          verified: user.emailVerified ? m.profile_description_verified() : m.profile_description_unverified(),
          email: user.email,
          role: user.role ?? "user"
        })}
        meta={m.profile_meta()}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Section className="sm:row-span-2" title={m.profile_edit_personal_data()}>
          <EditUser user={user} />
        </Section>
        <Section title={m.profile_change_email()}>
          <ChangeEmail />
        </Section>
        <Section title={m.profile_change_password()}>
          <ChangePassword />
        </Section>
        <Section className="sm:col-span-2" title={m.profile_delete_title()}>
          <DeleteAccount />
        </Section>
      </div>
    </div>
  )
}

function EditUser({ user }: Readonly<{ user: User }>) {
  const { updateUser } = useAuthClient()
  const [loading, setLoading] = useState(false)

  const form = useAppForm({
    defaultValues: {
      name: user?.name,
      image: user?.image
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
        if (data?.status) toast.success(m.profile_success_user_updated())
      } catch {
        toast.error(m.error_generic())
      } finally {
        setLoading(false)
      }
    }
  })

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col gap-2"
    >
      <form.AppField name="name">{field => <field.TextField label={m.profile_field_name()} />}</form.AppField>
      <form.AppField name="image">{field => <field.TextField label={m.profile_field_image()} />}</form.AppField>
      <Button type="submit" className="mt-4" loading={loading}>
        {m.profile_submit()}
      </Button>
    </form>
  )
}

function ChangeEmail() {
  const { changeEmail } = useAuthClient()
  const [loading, setLoading] = useState(false)

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
        const { error, data } = await changeEmail(parsed.data)
        if (error) toast.error(authErrorMessage(error))
        if (data?.status) toast.success(m.profile_success_email_updated())
      } catch {
        toast.error(m.error_generic())
      } finally {
        setLoading(false)
      }
    }
  })

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="flex flex-col gap-2"
    >
      <form.AppField name="newEmail">
        {field => <field.TextField label={m.profile_field_new_email()} type="email" />}
      </form.AppField>
      <Button type="submit" className="mt-4" loading={loading}>
        {m.profile_submit()}
      </Button>
    </form>
  )
}

function ChangePassword() {
  const { changePassword } = useAuthClient()
  const [loading, setLoading] = useState(false)

  const form = useAppForm({
    defaultValues: {
      newPassword: "",
      currentPassword: "",
      revokeOtherSessions: true
    },
    validators: {
      onSubmit: changePasswordSchema
    },
    onSubmit: async ({ value }) => {
      const parsed = changePasswordSchema.safeParse(value)
      if (!parsed.success) {
        toast.error(validationMessage(parsed.error.issues[0]?.message))
        return
      }

      try {
        setLoading(true)
        const { error, data } = await changePassword({
          newPassword: parsed.data.newPassword,
          currentPassword: parsed.data.currentPassword,
          revokeOtherSessions: parsed.data.revokeOtherSessions
        })
        if (error) toast.error(authErrorMessage(error))
        if (data?.user) toast.success(m.profile_success_password_changed())
      } catch {
        toast.error(m.error_generic())
      } finally {
        setLoading(false)
      }
    }
  })

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={e => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.AppField name="newPassword">
        {field => (
          <field.TextField label={m.profile_field_new_password()} type="password" autoComplete="new-password" />
        )}
      </form.AppField>

      <form.AppField name="currentPassword">
        {field => (
          <field.TextField label={m.profile_field_current_password()} type="password" autoComplete="current-password" />
        )}
      </form.AppField>

      <form.AppField name="revokeOtherSessions">
        {field => (
          <field.CheckboxField
            label={m.profile_field_revoke_other_sessions()}
            className="mt-1 flex justify-end [&>label]:w-auto!"
          />
        )}
      </form.AppField>

      <Button type="submit" className="mt-4" loading={loading}>
        {m.profile_submit()}
      </Button>
    </form>
  )
}

// Hard delete (GDPR erasure): everything the user owns cascades from the user row. Better Auth wants a recent sign-in for it.
function DeleteAccount() {
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
      <p className="m-0 text-[14.5px] text-muted">{m.profile_delete_description()}</p>
      <ConfirmDialog
        title={m.profile_delete_confirm_title()}
        description={m.profile_delete_confirm_description()}
        confirm={m.profile_delete_confirm_button()}
        onConfirm={onConfirm}
      >
        <Button className="shrink-0 text-red-400" loading={loading}>
          {m.profile_delete_button()}
        </Button>
      </ConfirmDialog>
    </div>
  )
}
