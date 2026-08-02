import { createFileRoute } from "@tanstack/react-router"
import { Configuration } from "./-components/configuration"
import { Footer } from "./-components/footer"
import { Header } from "./-components/header"
import { Hero } from "./-components/hero"
import { Install } from "./-components/install"
import { MemoryAndDatasets } from "./-components/memory-and-datasets"
import { Personas } from "./-components/personas"
import { WhyKaja } from "./-components/why-kaja"

export const Route = createFileRoute("/_public/_landing/")({ component: App })

function App() {
  return (
    <div className="min-h-screen bg-bg font-body leading-normal text-muted">
      <style>{`
        @keyframes blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
      `}</style>

      <Header />
      <Hero />
      <WhyKaja />
      <Personas />
      <MemoryAndDatasets />
      <Configuration />
      <Install />
      <Footer />
    </div>
  )
}
