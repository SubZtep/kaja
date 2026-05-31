import { createFileRoute, Outlet } from "@tanstack/react-router"
import { Main } from "../../../components/ui/Main"
import { Section } from "../../../components/ui/Section"

export const Route = createFileRoute("/_public/(auth)/device")({
  component: () => (
    <Main className="bg-amber-900/20 rounded-4xl border-2 shadow-cyan-500 shadow-2xl py-22 border-stone-500/50">
      <Section className="max-w-lg flex flex-col items-center justify-center gap-6 text-center">
        <Outlet />
      </Section>
    </Main>
  )
})
