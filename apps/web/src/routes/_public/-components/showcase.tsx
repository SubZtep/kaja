import { cn } from "@kaja/shared/ui"
import { useLoaderData } from "@tanstack/react-router"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { toast } from "react-toastify"
import { m } from "../../../paraglide/messages.js"
import { BarkochbaGame } from "./barkochba-game"
import { Sticker } from "./sticker"

// The centred card leaves a sliver of each neighbour showing at the edges
const SLOT = "flex w-[84%] shrink-0 snap-center flex-col gap-2"

let chatWidget: Promise<void> | undefined

/** The standalone chat widget's script, fetched on the first tap of the Chat card rather than with the page; it builds its bubble as soon as it runs. */
function loadChatWidget(src: string) {
  chatWidget ??= new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.async = true
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => {
      // A failed download may be retried with the next tap
      script.remove()
      chatWidget = undefined
      reject(new Error(`Could not load ${src}`))
    }
    document.body.appendChild(script)
  })
  return chatWidget
}

async function openChatWidget(apiUrl: string, widgetKey: string | undefined) {
  if (widgetKey) await loadChatWidget(`${apiUrl}/widget/${widgetKey}.js`).catch(() => {})
  const bubble = document.querySelector<HTMLButtonElement>(".kaja-widget-bubble")
  const panel = document.querySelector<HTMLElement>(".kaja-widget-panel")
  if (!widgetKey || !bubble) {
    toast.info(widgetKey ? m.carousel_chat_missing() : m.carousel_demo_missing())
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
        <h2 className="m-0 font-display font-extrabold text-fg text-xl">{title}</h2>
        <p className="mt-0.5 mb-0 font-crt text-muted text-sm">{meta}</p>
      </div>
    </div>
  )
}

/** Infinite snap carousel of live toys and coming-soon tiles, sized to its column (the hero's right side): the current card sits centered with both neighbours peeking in. */
export function Showcase() {
  const { apiUrl, barkochbaWidgetKey, chatWidgetKey } = useLoaderData({ from: "__root__" })
  const scroller = useRef<HTMLDivElement>(null)

  const toys: { key: string; node: ReactNode }[] = [
    {
      key: "barkochba",
      node: barkochbaWidgetKey ? (
        <div className={SLOT}>
          <div className="toy-card">
            <Sticker tone="neon" rotate={-7} className="absolute top-3 right-3 z-1">
              {m.stamp_live()}
            </Sticker>
            <BarkochbaGame className="h-full rounded-none border-0 shadow-none" />
          </div>
          <div className="px-1">
            <h2 className="m-0 font-display font-extrabold text-fg text-xl">{m.carousel_barkochba_title()}</h2>
            <p className="mt-0.5 mb-0 font-crt text-muted text-sm">{m.carousel_barkochba_meta()}</p>
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
      )
    },
    {
      key: "chat",
      node: (
        <ToyCard
          src="/art/bubble.webp"
          rotate={2.2}
          stamp={chatWidgetKey ? m.stamp_live() : m.stamp_soon()}
          live={Boolean(chatWidgetKey)}
          title={m.carousel_chat_title()}
          meta={m.carousel_chat_meta()}
          onClick={() => openChatWidget(apiUrl, chatWidgetKey)}
        />
      )
    },
    {
      key: "voice",
      node: (
        <ToyCard
          src="/art/cassette.webp"
          rotate={-2.4}
          stamp={m.stamp_soon()}
          title={m.carousel_voice_title()}
          meta={m.carousel_voice_meta()}
        />
      )
    },
    {
      key: "care",
      node: (
        <ToyCard
          src="/art/heart.webp"
          rotate={1.6}
          stamp={m.stamp_soon()}
          title={m.carousel_care_title()}
          meta={m.carousel_care_meta()}
        />
      )
    }
  ]
  const count = toys.length

  // The loop: cards are rotated, never cloned (the live game keeps its state), so the current one is always second, with one card on each side to scroll to.
  // The server can't centre, so it renders the first toy first; the client rotates the last one in front before its first paint.
  const [first, setFirst] = useState(0)
  const ordered = toys.map((_, i) => toys[(first + i) % count] as (typeof toys)[number])

  useLayoutEffect(() => {
    setFirst(count - 1)
  }, [count])

  const centerCurrent = useCallback(() => {
    const el = scroller.current
    const slot = el?.children[1] as HTMLElement | undefined
    if (!el || !slot) return
    el.scrollTo({ left: slot.offsetLeft + slot.offsetWidth / 2 - el.clientWidth / 2, behavior: "instant" })
  }, [])

  // Re-centres after every rotation, before paint, so the jump back is invisible
  // biome-ignore lint/correctness/useExhaustiveDependencies: `first` is the trigger, not an input
  useLayoutEffect(centerCurrent, [first, centerCurrent])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const resize = new ResizeObserver(centerCurrent)
    resize.observe(el)

    // Once a scroll settles, rotate so the card now in the middle becomes the second one again
    const settle = () => {
      const middle = el.scrollLeft + el.clientWidth / 2
      const slots = Array.from(el.children) as HTMLElement[]
      const nearest = slots.reduce(
        (best, slot, i) => {
          const distance = Math.abs(slot.offsetLeft + slot.offsetWidth / 2 - middle)
          return distance < best.distance ? { i, distance } : best
        },
        { i: 1, distance: Number.POSITIVE_INFINITY }
      )
      if (nearest.i !== 1) setFirst(f => (f + nearest.i - 1 + slots.length) % slots.length)
    }
    // Safari before 26 has no scrollend, so a short pause in scroll events stands in for it
    let timer: ReturnType<typeof setTimeout> | undefined
    const debounced = () => {
      clearTimeout(timer)
      timer = setTimeout(settle, 150)
    }
    const hasScrollEnd = "onscrollend" in window
    el.addEventListener(hasScrollEnd ? "scrollend" : "scroll", hasScrollEnd ? settle : debounced)
    return () => {
      resize.disconnect()
      clearTimeout(timer)
      el.removeEventListener(hasScrollEnd ? "scrollend" : "scroll", hasScrollEnd ? settle : debounced)
    }
  }, [centerCurrent])

  const step = (dir: -1 | 1) => {
    const el = scroller.current
    const [prev, current] = Array.from(el?.children ?? []) as HTMLElement[]
    if (!el || !prev || !current) return
    el.scrollBy({ left: dir * (current.offsetLeft - prev.offsetLeft), behavior: "smooth" })
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-end justify-between gap-3">
        <Sticker tone="neon" rotate={-6} className="text-xs">
          {m.carousel_label()}
        </Sticker>
        <div className="hidden gap-2 sm:flex">
          <button
            type="button"
            className="flex size-9 cursor-pointer items-center justify-center border border-fg bg-surface text-fg hover:bg-neon hover:text-bg"
            onClick={() => step(-1)}
            aria-label={m.carousel_prev()}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="flex size-9 cursor-pointer items-center justify-center border border-fg bg-surface text-fg hover:bg-neon hover:text-bg"
            onClick={() => step(1)}
            aria-label={m.carousel_next()}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div
        ref={scroller}
        className="hide-scrollbar mask-[linear-gradient(to_right,transparent,#000_9%,#000_91%,transparent)] relative flex snap-x snap-mandatory items-start gap-4 overflow-x-auto pt-3 pb-6"
      >
        {ordered.map(toy => (
          <Fragment key={toy.key}>{toy.node}</Fragment>
        ))}
      </div>
    </div>
  )
}
