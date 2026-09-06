import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { useState } from "react"
import { Button } from "../../components/form/primitives/Button"
import { PageHeader } from "../../components/ui/PageHeader"
import { Section } from "../../components/ui/Section"
import { getPageTitle } from "../../lib/vars"

const throwServerError = createServerFn({ method: "GET" }).handler(() => {
  throw new Error("Sentry Example Server Error")
})

export const Route = createFileRoute("/_public/sentry-example-page")({
  component: SentryExamplePage,
  head: () => ({ meta: [{ title: getPageTitle("Sentry Example") }] })
})

function SentryExamplePage() {
  const [error, setError] = useState<string>()

  return (
    <>
      <PageHeader
        title="Sentry example page"
        description="Trigger a test error to verify Sentry is capturing events."
      />

      <Section className="flex flex-wrap gap-3">
        <Button
          onClick={() => {
            throw new Error("Sentry Example Frontend Error")
          }}
        >
          Throw frontend error
        </Button>

        <Button
          onClick={async () => {
            try {
              await throwServerError()
            } catch {
              setError("Server error thrown — check Sentry.")
            }
          }}
        >
          Throw backend error
        </Button>

        {error ? <p className="w-full text-muted text-sm">{error}</p> : null}
      </Section>
    </>
  )
}
