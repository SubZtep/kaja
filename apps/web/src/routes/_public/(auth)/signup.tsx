import { registerSchema } from "@kaja/schemas"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../../components/form/primitives/Button"
import { Menu } from "../../../components/layout/Menu"
import { Main } from "../../../components/ui/Main"
import { Section } from "../../../components/ui/Section"
import { useAuthClient } from "../../../hooks/auth-client"
import { useAppForm } from "../../../lib/form"

export const Route = createFileRoute("/_public/(auth)/signup")({
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
    <Main>
      <Section className="max-w-lg">
        <Menu className="pb-2 opacity-60 hover:opacity-100 transition-opacity ease-in-out duration-150 mb-2" />
        <h1>Sign Up</h1>
        <p className="my-4">Enter your details:</p>

        <form
          onSubmit={e => {
            e.preventDefault()
            form.handleSubmit()
          }}
          className="flex flex-col gap-2"
        >
          <form.AppField name="name">
            {field => <field.TextField label="Name" placeholder="Enter your name" />}
          </form.AppField>

          <form.AppField name="email">
            {field => <field.TextField label="Email" type="email" placeholder="Enter your email" />}
          </form.AppField>

          <form.AppField name="password">
            {field => <field.TextField label="Password" type="password" autoComplete="new-password" />}
          </form.AppField>

          <form.AppField name="image">
            {field => <field.TextField label="Image" placeholder="Anything" />}
          </form.AppField>

          <Button type="submit" loading={loading} className="mt-3">
            Submit
          </Button>
        </form>
      </Section>
    </Main>
  )
}
