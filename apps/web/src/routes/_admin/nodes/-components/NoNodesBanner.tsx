import { Server } from "lucide-react"

export function NoNodesBanner() {
  return (
    <section className="rounded-2xl bg-surface p-12 shadow-2xl text-center">
      <div className="flex justify-center mb-4">
        <div className="rounded-full bg-surface-2 p-4">
          <Server size={32} className="text-muted" />
        </div>
      </div>
      <h3 className="mb-2 text-xl font-headline font-bold text-fg">No nodes connected</h3>
      <p className="max-w-md mx-auto leading-relaxed text-muted">
        Connect a CLI node to start seeing your orchestrated nodes here.
      </p>
    </section>
  )
}
