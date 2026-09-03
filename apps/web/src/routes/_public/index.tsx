import { createFileRoute } from "@tanstack/react-router"
import { getPageTitle } from "../../lib/vars"
import { Configuration } from "./-components/configuration"
import { Hero } from "./-components/hero"
import { Install } from "./-components/install"
import { MemoryAndDatasets } from "./-components/memory-and-datasets"
import { Personas } from "./-components/personas"
import { WhyKaja } from "./-components/why-kaja"

export const Route = createFileRoute("/_public/")({
  component: LandingPage,
  head: () => ({ meta: [{ title: getPageTitle() }] })
})

function LandingPage() {
  return (
    <>
      <Hero />
      <WhyKaja />
      <Personas />
      <MemoryAndDatasets />
      <Configuration />
      <Install />
    </>
  )
}
