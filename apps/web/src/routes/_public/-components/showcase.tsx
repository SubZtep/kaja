import { cn } from "@kaja/shared/ui"
import { useLoaderData } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { ContentWidth } from "../../../components/layout/content-width"
import { m } from "../../../paraglide/messages.js"
import { BarkochbaGame } from "./barkochba-game"
import { SectionTitle } from "./section-title"
import { Sticker } from "./sticker"

const SLOT = "flex min-w-0 flex-col gap-2"

function ToyCard({
  src,
  rotate,
  stamp,
  live,
  title,
  meta,
  onClick,
  children
}: Readonly<{
  src: string
  rotate: number
  stamp: string
  live?: boolean
  title: string
  meta: string
  onClick?: () => void
  children?: ReactNode
}>) {
  const card = "toy-card min-h-72 bg-surface-2 p-0 text-left"
  const face = (
    <>
      {children ?? (
        <img
          src={src}
          alt=""
          width={704}
          height={704}
          loading="lazy"
          decoding="async"
          className="h-72 w-full object-cover"
          style={{ imageRendering: "auto" }}
        />
      )}
      <Sticker
        tone={live ? "neon" : "ice"}
        rotate={rotate > 0 ? -8 : 7}
        className="pointer-events-none absolute top-3 right-3 z-1"
      >
        {stamp}
      </Sticker>
      <span className="tape top-2 left-8 w-16 -rotate-12" />
    </>
  )
  return (
    <div className={SLOT}>
      {/* A clickable card is a real button, so Enter and Space work without a key handler. */}
      {onClick ? (
        <button type="button" onClick={onClick} className={cn(card, "cursor-pointer")}>
          {face}
        </button>
      ) : (
        <article className={card}>{face}</article>
      )}
      <div className="px-1">
        <h3 className="font-display text-fg m-0 text-xl font-extrabold">{title}</h3>
        <p className="font-crt text-muted mt-0.5 mb-0 text-sm">{meta}</p>
      </div>
    </div>
  )
}

/** A coming-soon toy: thumbnail, title and one line. */
function SoonItem({ src, title, meta }: Readonly<{ src: string; title: string; meta: string }>) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img src={src} alt="" width={704} height={704} loading="lazy" decoding="async" className="size-12 object-cover" />
      <div className="min-w-0">
        <h3 className="font-display text-fg m-0 text-base leading-tight font-extrabold">{title}</h3>
        <p className="font-crt text-muted mt-0.5 mb-0 text-sm">{meta}</p>
      </div>
    </div>
  )
}

/** Live toys to play with on the page, and the ones still coming. */
export function Showcase() {
  const { barkochbaReady } = useLoaderData({ from: "__root__" })

  return (
    <section>
      <ContentWidth className="py-10 sm:py-16">
        <SectionTitle
          title={m.try_title()}
          sticker={
            <Sticker tone="neon" rotate={-6} className="text-[10px]">
              {m.stamp_live()}
            </Sticker>
          }
        />
        <div className="grid gap-5 md:grid-cols-3">
          <div className="md:col-span-2">
            {barkochbaReady ? (
              <div className={SLOT}>
                <div className="toy-card min-h-72">
                  <BarkochbaGame className="h-full rounded-none border-0 shadow-none" />
                </div>
                <div className="px-1">
                  <h3 className="font-display text-fg m-0 text-xl font-extrabold">{m.carousel_barkochba_title()}</h3>
                  <p className="font-crt text-muted mt-0.5 mb-0 text-sm">{m.carousel_barkochba_meta()}</p>
                </div>
              </div>
            ) : (
              <ToyCard
                src="/art/tree.webp"
                rotate={-1.8}
                stamp={m.stamp_soon()}
                title={m.carousel_barkochba_title()}
                meta={m.carousel_barkochba_meta()}
              />
            )}
          </div>
          <ToyCard
            src="/art/bubble.webp"
            rotate={2.2}
            stamp={m.stamp_soon()}
            title={m.carousel_chat_title()}
            meta={m.carousel_chat_meta()}
          />
        </div>

        <div className="toy-card bg-surface mt-8 p-4">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-8">
            <Sticker rotate={-6} className="text-[10px]">
              {m.stamp_soon()}
            </Sticker>
            <SoonItem src="/art/heart.webp" title={m.carousel_care_title()} meta={m.carousel_care_meta()} />
            <SoonItem src="/art/cassette.webp" title={m.carousel_voice_title()} meta={m.carousel_voice_meta()} />
          </div>
        </div>
      </ContentWidth>
    </section>
  )
}
