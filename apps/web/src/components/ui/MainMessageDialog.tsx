import { Main } from "./Main"
import { Section } from "./Section"

export function MainMessageDialog({ children }: { children: React.ReactNode }) {
  return (
    <Main className="bg-amber-900/20 rounded-4xl border-2 shadow-cyan-500 shadow-2xl py-22 border-stone-500/50">
      <Section className="max-w-lg flex flex-col items-center justify-center gap-6 text-center">{children}</Section>
    </Main>
  )
}
