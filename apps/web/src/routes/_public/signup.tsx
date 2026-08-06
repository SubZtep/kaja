import { registerSchema } from "@kaja/schema"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../components/form/primitives/Button"
import { useAuthClient } from "../../hooks/auth-client"
import { useAppForm } from "../../lib/form"
import { AuthCard } from "./-components/auth-card"
import { AuthShell } from "./-components/auth-shell"

export const Route = createFileRoute("/_public/signup")({
  component: SignUp
})

function SignUp() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { signUp } = useAuthClient()

  const form = useAppForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      image: ""
    },
    validators: {
      onSubmit: registerSchema
    },
    onSubmit: async ({ value }) => {
      const parsed = registerSchema.safeParse(value)
      if (!parsed.success) {
        toast.error(parsed.error?.message ?? "Invalid data")
        return
      }

      try {
        setLoading(true)
        const { error, data } = await signUp.email(parsed.data)

        if (error) toast.error(error.message ?? error.statusText)
        if (data?.user) {
          toast.success("User registered")
          navigate({ to: "/dashboard" })
        }
      } catch (error: any) {
        toast.error(error.message)
      } finally {
        setLoading(false)
      }
    }
  })

  return (
    <AuthShell>
      <AuthCard
        title="Create account"
        description="Sign up to access the admin portal and manage your Kaja setup."
        footer={
          <>
            Already have an account?{" "}
            <Link to="/signin" className="font-medium text-neon hover:text-neon-hi">
              Sign in
            </Link>
          </>
        }
      >
        <form
          onSubmit={e => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <form.AppField name="name">
            {field => <field.TextField label="Name" layout="stack" placeholder="Your name" autoComplete="name" />}
          </form.AppField>

          <form.AppField name="email">
            {field => (
              <field.TextField
                label="Email"
                layout="stack"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
              />
            )}
          </form.AppField>

          <form.AppField name="password">
            {field => (
              <field.TextField
                label="Password"
                layout="stack"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
              />
            )}
          </form.AppField>

          <form.AppField name="image">
            {field => <field.TextField label="Image URL" layout="stack" placeholder="Optional avatar URL" />}
          </form.AppField>

          <Button
            type="submit"
            loading={loading}
            className="mt-1 w-full rounded-md border border-green-600 bg-green-700 font-semibold text-sm text-white hover:bg-green-600"
          >
            Create account
          </Button>
        </form>
      </AuthCard>
    </AuthShell>
  )
}
