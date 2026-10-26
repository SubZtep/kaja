import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../../../components/ui/page-header"
import { Section } from "../../../components/ui/section"
import { SignedInDevices } from "../../../components/user/signed-in-devices"
import { seo } from "../../../lib/seo"
import { m } from "../../../paraglide/messages.js"

export const Route = createFileRoute("/_portal/account/devices")({
  component: DevicesPage,
  head: () => ({ meta: seo({ title: m.nav_devices() }) })
})

function DevicesPage() {
  return (
    <>
      <PageHeader title={m.nav_devices()} description={m.devices_description()} />
      <Section className="max-w-2xl" title={m.devices_title()}>
        <SignedInDevices />
      </Section>
    </>
  )
}
