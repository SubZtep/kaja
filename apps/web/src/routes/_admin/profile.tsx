import { changePasswordSchema, type EditEmailInput, editEmailSchema, editSchema } from "@kaja/schema"
import { createFileRoute } from "@tanstack/react-router"
import type { User } from "better-auth"
import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../components/form/primitives/Button"
import { useAuthClient } from "../../hooks/auth-client"
import { useAppForm } from "../../lib/form"
import { userRequired } from "../../lib/loaders"

export const Route = createFileRoute("/_admin/profile")({
  component: Profile,
  loader: () => userRequired()
})

function Profile() {
  const user = Route.useLoaderData()

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="my-0 text-3xl font-headline font-extrabold tracking-tight text-fg">Profile</h2>
        <p className="text-sm text-muted">
          Logged in with the {user.emailVerified ? "verified" : "unverified"}{" "}
          <strong className="text-fg">{user.email}</strong> as <strong className="text-neon">{user.role}</strong>.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border/40 bg-surface p-6 sm:row-span-2">
          <h3 className="mb-4 font-headline font-bold text-fg">Edit Personal Data</h3>
          <EditUser user={user} />
        </div>
        <div className="rounded-xl border border-border/40 bg-surface p-6">
          <h3 className="mb-4 font-headline font-bold text-fg">Change Email</h3>
          <ChangeEmail />
        </div>
        <div className="rounded-xl border border-border/40 bg-surface p-6">
          <h3 className="mb-4 font-headline font-bold text-fg">Change Password</h3>
          <ChangePassword />
        </div>
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
        toast.error(parsed.error?.message ?? "Invalid data")
        return
      }

      try {
        setLoading(true)
        const { error, data } = await updateUser(parsed.data)
        if (error) toast.error(error.message ?? error.statusText)
        if (data?.status) toast.success("User updated")
      } catch (error: any) {
        toast.error(error.message)
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
      <form.AppField name="name">{field => <field.TextField label="Name" />}</form.AppField>
      <form.AppField name="image">{field => <field.TextField label="Image" />}</form.AppField>
      <Button type="submit" className="mt-4" loading={loading}>
        Submit
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
        toast.error(parsed.error?.message ?? "Invalid data")
        return
      }

      try {
        setLoading(true)
        const { error, data } = await changeEmail(parsed.data)
        if (error) toast.error(error.message ?? error.statusText)
        if (data?.status) toast.success("User email updated")
      } catch (error: any) {
        toast.error(error.message)
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
      <form.AppField name="newEmail">{field => <field.TextField label="New email" type="email" />}</form.AppField>
      <Button type="submit" className="mt-4" loading={loading}>
        Submit
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
        toast.error(parsed.error?.message ?? "Invalid data")
        return
      }

      try {
        setLoading(true)
        const { error, data } = await changePassword({
          newPassword: parsed.data.newPassword,
          currentPassword: parsed.data.currentPassword,
          revokeOtherSessions: parsed.data.revokeOtherSessions
        })
        if (error) toast.error(error.message ?? error.statusText)
        if (data?.user) toast.success("Password changed")
      } catch (error: any) {
        toast.error(error.message)
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
        {field => <field.TextField label="New password" type="password" autoComplete="new-password" />}
      </form.AppField>

      <form.AppField name="currentPassword">
        {field => <field.TextField label="Current password" type="password" autoComplete="current-password" />}
      </form.AppField>

      <form.AppField name="revokeOtherSessions">
        {field => (
          <field.CheckboxField label="Revoke other sessions" className="flex justify-end [&>label]:w-auto! mt-1" />
        )}
      </form.AppField>

      <Button type="submit" className="mt-4" loading={loading}>
        Submit
      </Button>
    </form>
  )
}
