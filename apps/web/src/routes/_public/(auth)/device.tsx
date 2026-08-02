import { createFileRoute, Outlet } from "@tanstack/react-router"
import { Main } from "../../../components/ui/Main"
import { Section } from "../../../components/ui/Section"

export const Route = createFileRoute("/_public/(auth)/device")({
  component: () => (
    <Main className="bg-surface-2/40 rounded-4xl border-2 shadow-[0_0_40px_rgba(88,166,255,0.25)] py-22 border-border/50">
      <Section className="max-w-lg flex flex-col items-center justify-center gap-6 text-center">
        <Outlet />
      </Section>
    </Main>
  )
})
