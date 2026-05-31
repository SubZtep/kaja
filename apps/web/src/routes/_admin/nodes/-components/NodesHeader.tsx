import { LiveBanner } from "./LiveBanner"

export function NodesHeader({ isLive, children }: { isLive: boolean; children: React.ReactNode }) {
  return (
    <header className="mb-12 flex flex-col lg:flex-row justify-between lg:items-end gap-8">
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="my-0 text-5xl font-headline font-bold tracking-tighter text-fg">My Nodes</h2>
          {isLive && <LiveBanner />}
        </div>
        <p className="max-w-lg text-lg leading-relaxed text-muted">
          Connected CLI nodes sending heartbeats to the orchestration platform.
        </p>
      </div>
      <div className="flex gap-4">{children}</div>
    </header>
  )
}
