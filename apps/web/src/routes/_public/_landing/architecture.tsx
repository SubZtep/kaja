import { createFileRoute } from "@tanstack/react-router"
import { Architecture } from "./-components/architecture"
import { Footer } from "./-components/footer"
import { Header } from "./-components/header"

export const Route = createFileRoute("/_public/_landing/architecture")({ component: ArchitecturePage })

function ArchitecturePage() {
  return (
    <div
      style={{
        background: "#0a0d12",
        color: "#c9d1d9",
        fontFamily: "'Inter', system-ui, sans-serif",
        minHeight: "100vh",
        lineHeight: 1.5
      }}
    >
      <Header />
      <Architecture />
      <Footer />
    </div>
  )
}
