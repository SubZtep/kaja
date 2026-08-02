import { createFileRoute } from "@tanstack/react-router"
import { Architecture } from "./-components/architecture"
import { Footer } from "./-components/footer"
import { Header } from "./-components/header"

export const Route = createFileRoute("/_public/_landing/architecture")({ component: ArchitecturePage })

function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-bg font-body leading-normal text-muted">
      <Header />
      <Architecture />
      <Footer />
    </div>
  )
}
