import { changePasswordSchema, type EditEmailInput, editEmailSchema, editSchema } from "@kaja/schema/api"
import { createFileRoute } from "@tanstack/react-router"
import type { User } from "better-auth"
import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../components/form/primitives/Button"
import { PageHeader } from "../../components/ui/PageHeader"
import { Section } from "../../components/ui/Section"
import { useAuthClient } from "../../hooks/auth-client"
import { useAppForm } from "../../lib/form"
import { userRequired } from "../../lib/loaders"
import { getPageTitle } from "../../lib/vars"

export const Route = createFileRoute("/_admin/profile")({
  component: Profile,
  loader: () => userRequired(),
  head: () => ({ meta: [{ title: getPageTitle("Profile") }] })
})

function Profile() {
  const user = Route.useLoaderData()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description={
          <>
            Logged in with the {user.emailVerified ? "verified" : "unverified"}{" "}
            <strong className="text-fg">{user.email}</strong> as <strong className="text-neon">{user.role}</strong>.
          </>
        }
        meta="account"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Section className="sm:row-span-2">
          <h2 className="m-0 mb-4 font-semibold text-fg text-[15px]">Edit Personal Data</h2>
          <EditUser user={user} />
        </Section>
        <Section>
          <h2 className="m-0 mb-4 font-semibold text-fg text-[15px]">Change Email</h2>
          <ChangeEmail />
        </Section>
        <Section>
          <h2 className="m-0 mb-4 font-semibold text-fg text-[15px]">Change Password</h2>
          <ChangePassword />
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
          <field.CheckboxField label="Revoke other sessions" className="mt-1 flex justify-end [&>label]:w-auto!" />
        )}
      </form.AppField>

      <Button type="submit" className="mt-4" loading={loading}>
        Submit
      </Button>
    </form>
  )
}
