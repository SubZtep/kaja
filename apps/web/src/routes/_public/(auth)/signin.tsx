import { loginSchema } from "@kaja/schemas"
import { createFileRoute, useSearch } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "react-toastify"
import { z } from "zod"
import { Button } from "#/components/form/primitives/Button"
import { Menu } from "#/components/layout/Menu"
import { Main } from "#/components/ui/Main"
import { Section } from "#/components/ui/Section"
import { ForgotPassword } from "#/components/user/ForgotPassword"
import { useAuthClient } from "#/hooks/auth-client"
import { useAppForm } from "#/lib/form"
import { logger } from "#/lib/logger"

const signinSearchSchema = z.object({
  redirect: z.string().optional()
})

export const Route = createFileRoute("/_public/(auth)/signin")({
  validateSearch: signinSearchSchema,
  component: SignIn
})

function SignIn() {
  const { redirect } = useSearch({ from: "/_public/(auth)/signin" })
  const authClient = useAuthClient()
  const [loading, setLoading] = useState(false)

  const form = useAppForm({
    defaultValues: {
      email: "",
      password: "",
      rememberMe: true
    },
    validators: {
      onSubmit: loginSchema
    },
    onSubmit: async ({ value }) => {
      logger.info({ value }, "Sign in form submitted")
      const parsed = loginSchema.safeParse(value)
      if (!parsed.success) {
        toast.error(parsed.error?.message ?? "Invalid data")
        logger.error({ error: parsed.error }, "Sign in form validation failed")
        return
      }

      try {
        setLoading(true)
        const { error } = await authClient.signIn.email({
          ...parsed.data,
          callbackURL: redirect ?? "/dashboard"
        })
        if (error) {
          toast.error(error.message ?? error.statusText)
          logger.error({ error }, "Sign in failed")
        }
      } catch (error: any) {
        toast.error(error.message)
        logger.error({ error }, "Sign in fail catched")
      } finally {
        setLoading(false)
      }
    }
  })

  return (
    <Main>
      <Section className="max-w-lg">
        <Menu className="pb-2 opacity-60 hover:opacity-100 transition-opacity ease-in-out duration-150 mb-2" />
        <h1 className="mb-4">Sign In</h1>

        <form
          onSubmit={event => {
            event.preventDefault()
            const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
            form.handleSubmit({ action: submitter?.value })
          }}
          className="flex flex-col gap-2"
        >
          <form.AppField name="email">
            {field => <field.TextField label="Email" type="email" autoComplete="email" />}
          </form.AppField>

          <form.AppField name="password">
            {field => <field.TextField label="Password" type="password" autoComplete="current-password" />}
          </form.AppField>

          <form.AppField name="rememberMe">
            {field => <field.CheckboxField label="Remember Me" className="flex justify-end [&>label]:w-auto! mt-1" />}
          </form.AppField>

          <Button type="submit" loading={loading} className="mt-4 mb-1">
            Log me in
          </Button>

          <ForgotPassword getEmail={() => form.state.values.email}>
            <Button
              size="sm"
              variant="link"
              disabled={loading}
              className="hover:decoration-red-700 hover:underline-offset-4"
            >
              Forgot my password
            </Button>
          </ForgotPassword>
        </form>
      </Section>
    </Main>
  )
}
