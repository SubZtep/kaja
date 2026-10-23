import type { ImageStats } from "@kaja/schema/api"
import { formatBytes } from "../../lib/sandbox"
import { m } from "../../paraglide/messages.js"
import { Section } from "../ui/Section"
import { ValueBox } from "../ui/ValueBox"
import { BarList } from "./BarList"
import { CHANNEL_LABELS } from "./channels"

/** A user's stored images: what's kept now (all-time), what arrived in the last `days` days, top sites and chats. */
export function ImagesCard({ images, days }: Readonly<{ images: ImageStats; days: number }>) {
  if (images.count === 0)
    return (
      <Section title={m.stats_images_title()}>
        <p className="text-muted m-0 text-sm">{m.stats_images_empty()}</p>
      </Section>
    )
  return (
    <div className="flex flex-col gap-4">
      <Section title={m.stats_images_title()}>
        <div className="flex flex-wrap gap-3">
          <ValueBox label={m.stats_images_stored()} variant="neon">
            {images.count}
          </ValueBox>
          <ValueBox label={m.stats_images_storage()}>{formatBytes(images.bytes)}</ValueBox>
          <ValueBox label={m.stats_images_added({ days })}>
            <span title={formatBytes(images.addedBytes)}>{images.added}</span>
          </ValueBox>
          <ValueBox label={m.stats_images_undescribed()}>{images.undescribed}</ValueBox>
        </div>
      </Section>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarList
          title={m.stats_images_sites_title()}
          empty={m.stats_images_sites_empty()}
          rows={images.sites.map(site => ({ key: site.host, label: site.host, value: site.images }))}
        />
        <BarList
          title={m.stats_images_sessions_title()}
          rows={images.sessions.map(session => ({
            key: session.id,
            label: session.title,
            value: session.images,
            note: m.stats_images_session_note({
              size: formatBytes(session.bytes),
              channel: CHANNEL_LABELS[session.channel]()
            })
          }))}
        />
      </div>
    </div>
  )
}
