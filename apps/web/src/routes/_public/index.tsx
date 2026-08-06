import { createFileRoute } from "@tanstack/react-router"
import { Configuration } from "./-components/configuration"
import { Hero } from "./-components/hero"
import { Install } from "./-components/install"
import { MemoryAndDatasets } from "./-components/memory-and-datasets"
import { Personas } from "./-components/personas"
import { WhyKaja } from "./-components/why-kaja"

export const Route = createFileRoute("/_public/")({ component: LandingPage })

function LandingPage() {
  return (
    <>
      <style>{`
        @keyframes blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
      `}</style>

      <Hero />
      <WhyKaja />
      <Personas />
      <MemoryAndDatasets />
      <Configuration />
      <Install />
    </>
  )
}
