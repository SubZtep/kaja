import { createFileRoute, Outlet } from "@tanstack/react-router"
import { getChannelItems } from "../../components/layout/nav-items"
import { SectionTabs } from "../../components/layout/section-tabs"

export const Route = createFileRoute("/_portal/channels")({
  component: ChannelsLayout
})

/** Where you talk to Kaja from: the Telegram bot and published widgets. */
function ChannelsLayout() {
  return (
    <>
      <SectionTabs items={getChannelItems()} />
      <Outlet />
    </>
  )
}
