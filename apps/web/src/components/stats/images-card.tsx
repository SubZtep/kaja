import type { ImageStats } from "@kaja/schema/api"
import { Link } from "@tanstack/react-router"
import { formatBytes } from "../../lib/sandbox"
import { m } from "../../paraglide/messages.js"
import { Section } from "../ui/section"
import { ValueBox } from "../ui/value-box"
import { BarList } from "./bar-list"
import { CHANNEL_LABELS } from "./channels"

const LINK = "text-neon underline"

/**
 * A user's stored images: what's kept now (all-time), what arrived in the last `days` days, top sites and chats. With
 * `adminUserId` (the admin user detail), its numbers and sites link to that user's images on the admin images page.
 */
export function ImagesCard({
  images,
  days,
  adminUserId
}: Readonly<{ images: ImageStats; days: number; adminUserId?: string }>) {
  const linked = (children: React.ReactNode, search: { site?: string; undescribed?: boolean } = {}) =>
    adminUserId ? (
      <Link to="/admin/images" search={{ user: adminUserId, ...search }} className={LINK}>
        {children}
      </Link>
    ) : (
      children
    )
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
            {linked(images.count)}
          </ValueBox>
          <ValueBox label={m.stats_images_storage()}>{formatBytes(images.bytes)}</ValueBox>
          <ValueBox label={m.stats_images_added({ days })}>
            <span title={formatBytes(images.addedBytes)}>{images.added}</span>
          </ValueBox>
          <ValueBox label={m.stats_images_undescribed()}>
            {images.undescribed > 0 ? linked(images.undescribed, { undescribed: true }) : images.undescribed}
          </ValueBox>
        </div>
      </Section>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarList
          title={m.stats_images_sites_title()}
          empty={m.stats_images_sites_empty()}
          rows={images.sites.map(site => ({
            key: site.host,
            label: linked(site.host, { site: site.host }),
            value: site.images
          }))}
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
