import { PageHeader } from "../../../../components/ui/PageHeader"
import { LiveBanner } from "./LiveBanner"

export function NodesHeader({ isLive, children }: Readonly<{ isLive: boolean; children: React.ReactNode }>) {
  return (
    <PageHeader
      title={
        <span className="inline-flex items-center gap-3">
          Nodes
          {isLive && <LiveBanner />}
        </span>
      }
      description="Connected CLI nodes sending heartbeats to the orchestration platform."
      meta="live stream"
    >
      {children}
    </PageHeader>
  )
}
