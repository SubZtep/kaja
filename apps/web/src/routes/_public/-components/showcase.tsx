import { cn } from "@kaja/shared"
import { useLoaderData } from "@tanstack/react-router"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { useRef } from "react"
import { toast } from "react-toastify"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { m } from "../../../paraglide/messages.js"
import { BarkochbaGame } from "./barkochba-game"
import { Sticker } from "./sticker"

function openChatWidget(configured: boolean) {
  const bubble = document.querySelector<HTMLButtonElement>(".kaja-widget-bubble")
  const panel = document.querySelector<HTMLElement>(".kaja-widget-panel")
  if (!configured || !bubble) {
    toast.info(configured ? m.carousel_chat_missing() : m.carousel_demo_missing())
    return
  }
  if (panel?.hidden !== false) bubble.click()
  else bubble.focus()
}

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
  return (
    <div className="flex w-[min(100%,22rem)] shrink-0 snap-start flex-col gap-2">
      <article
        onClick={onClick}
        onKeyDown={
          onClick
            ? e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onClick()
                }
              }
            : undefined
        }
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        className={cn("toy-card min-h-72 bg-surface-2 p-0 text-left", onClick && "cursor-pointer")}
      >
        {children ?? <img src={src} alt="" className="h-72 w-full object-cover" style={{ imageRendering: "auto" }} />}
        <Sticker
          tone={live ? "neon" : "ice"}
          rotate={rotate > 0 ? -8 : 7}
          className="pointer-events-none absolute top-3 right-3 z-1"
        >
          {stamp}
        </Sticker>
        <span className="tape top-2 left-8 w-16 rotate-[-12deg]" />
      </article>
      <div className="px-1">
        <h3 className="m-0 font-display font-extrabold text-fg text-xl">{title}</h3>
        <p className="mt-0.5 mb-0 font-crt text-muted text-sm">{meta}</p>
      </div>
    </div>
  )
}

/** Horizontal snap carousel of live toys and coming-soon tiles. */
export function Showcase() {
  const { barkochbaWidgetKey, chatWidgetKey } = useLoaderData({ from: "__root__" })
  const scroller = useRef<HTMLDivElement>(null)

  const scrollBy = (dir: -1 | 1) => {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 420), behavior: "smooth" })
  }

  return (
    <section className="overflow-x-clip pb-4">
      <ContentWidth className="py-8 sm:py-12">
        <div className="mb-6 flex items-end justify-between gap-3">
          <Sticker tone="neon" rotate={-6} className="text-xs">
            {m.carousel_label()}
          </Sticker>
          <div className="hidden gap-2 sm:flex">
            <button
              type="button"
              className="flex size-9 cursor-pointer items-center justify-center border border-fg bg-surface text-fg hover:bg-neon hover:text-bg"
              onClick={() => scrollBy(-1)}
              aria-label={m.carousel_prev()}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="flex size-9 cursor-pointer items-center justify-center border border-fg bg-surface text-fg hover:bg-neon hover:text-bg"
              onClick={() => scrollBy(1)}
              aria-label={m.carousel_next()}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div
          ref={scroller}
          className="hide-scrollbar flex snap-x snap-mandatory items-start gap-6 overflow-x-auto px-1 pb-6 pt-3"
        >
          {barkochbaWidgetKey ? (
            <div className="flex w-[min(100%,26rem)] shrink-0 snap-start flex-col gap-2">
              <div className="toy-card">
                <Sticker tone="neon" rotate={-7} className="absolute top-3 right-3 z-1">
                  {m.stamp_live()}
                </Sticker>
                <BarkochbaGame className="h-full rounded-none border-0 shadow-none" />
              </div>
              <div className="px-1">
                <h3 className="m-0 font-display font-extrabold text-fg text-xl">{m.carousel_barkochba_title()}</h3>
                <p className="mt-0.5 mb-0 font-crt text-muted text-sm">{m.carousel_barkochba_meta()}</p>
              </div>
            </div>
          ) : (
            <ToyCard
              src="/art/tree.jpg"
              rotate={-1.8}
              stamp={m.stamp_soon()}
              title={m.carousel_barkochba_title()}
              meta={m.carousel_barkochba_meta()}
            />
          )}

          <ToyCard
            src="/art/bubble.jpg"
            rotate={2.2}
            stamp={chatWidgetKey ? m.stamp_live() : m.stamp_soon()}
            live={Boolean(chatWidgetKey)}
            title={m.carousel_chat_title()}
            meta={m.carousel_chat_meta()}
            onClick={() => openChatWidget(Boolean(chatWidgetKey))}
          />

          <ToyCard
            src="/art/cassette.jpg"
            rotate={-2.4}
            stamp={m.stamp_soon()}
            title={m.carousel_voice_title()}
            meta={m.carousel_voice_meta()}
          />

          <ToyCard
            src="/art/heart.jpg"
            rotate={1.6}
            stamp={m.stamp_soon()}
            title={m.carousel_care_title()}
            meta={m.carousel_care_meta()}
          />
        </div>
      </ContentWidth>
    </section>
  )
}
