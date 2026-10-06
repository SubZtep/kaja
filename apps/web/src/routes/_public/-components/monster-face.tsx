import { cn } from "@kaja/shared/ui"
import { useEffect, useRef } from "react"

/**
 * Interactive stand-in for `/monster.gif`, traced pixel-for-pixel off the gif's own
 * 8px grid (41x14 cells) and split into five independently animatable parts. Tilts
 * in CSS3D toward the pointer, the pupils track it inside their sockets, and it
 * blinks and twitches its mouth on the same loose idle cadence as the source gif.
 *
 * Mounted client-only (lazy + Suspense in hero.tsx) over the real `<img>`, which stays
 * in the markup as the LCP element and the reduced-motion / no-JS fallback.
 * Regenerate these cell lists by re-tracing the gif if its art ever changes.
 */

const CELL = 10
const ROWS = 14

type Cell = readonly [number, number]

const BRACKET_L: readonly Cell[] = [
  [0, 6],
  [1, 6],
  [2, 5],
  [3, 4],
  [4, 4],
  [5, 3],
  [5, 4],
  [6, 2],
  [7, 2],
  [8, 2],
  [9, 2],
  [10, 2],
  [11, 2],
  [12, 1]
]
const BRACKET_R: readonly Cell[] = [
  [0, 0],
  [1, 0],
  [2, 1],
  [3, 2],
  [4, 2],
  [5, 2],
  [5, 3],
  [6, 4],
  [7, 4],
  [8, 4],
  [9, 4],
  [10, 4],
  [11, 4],
  [12, 5]
]
const MOUTH_BASE: readonly Cell[] = [
  [4, 1],
  [4, 2],
  [4, 3],
  [4, 4],
  [4, 5],
  [5, 0],
  [5, 6],
  [6, 0],
  [6, 6],
  [7, 0],
  [7, 3],
  [7, 6],
  [8, 0],
  [8, 3],
  [8, 6],
  [9, 0],
  [9, 3],
  [9, 6],
  [10, 0],
  [10, 3],
  [10, 6],
  [11, 1],
  [11, 2],
  [11, 4],
  [11, 5]
]
const MOUTH_VARIANT: readonly Cell[] = [
  [4, 1],
  [4, 5],
  [5, 0],
  [5, 6],
  [6, 0],
  [6, 6],
  [7, 0],
  [7, 3],
  [7, 6],
  [8, 0],
  [8, 3],
  [8, 6],
  [9, 0],
  [9, 3],
  [9, 6],
  [10, 0],
  [10, 3],
  [10, 6],
  [11, 1],
  [11, 2],
  [11, 4],
  [11, 5]
]
const EYE_L_RING: readonly Cell[] = [
  [4, 2],
  [4, 3],
  [4, 4],
  [4, 5],
  [5, 1],
  [5, 6],
  [6, 0],
  [6, 7],
  [7, 0],
  [7, 7],
  [8, 0],
  [8, 7],
  [9, 0],
  [9, 7],
  [10, 1],
  [10, 6],
  [11, 2],
  [11, 3],
  [11, 4],
  [11, 5]
]
const EYE_L_PUPIL: readonly Cell[] = [
  [7, 3],
  [7, 4],
  [8, 3],
  [8, 4]
]
const EYE_L_CLOSED: readonly Cell[] = [
  [7, 1],
  [7, 2],
  [7, 3],
  [7, 4],
  [7, 5],
  [7, 6]
]
const EYE_R_RING: readonly Cell[] = [
  [4, 2],
  [4, 3],
  [4, 4],
  [5, 1],
  [5, 5],
  [6, 0],
  [6, 6],
  [7, 0],
  [7, 6],
  [8, 0],
  [8, 6],
  [9, 1],
  [9, 5],
  [10, 2],
  [10, 3],
  [10, 4]
]
const EYE_R_PUPIL: readonly Cell[] = [[7, 3]]
const EYE_R_CLOSED: readonly Cell[] = [
  [7, 0],
  [7, 1],
  [7, 2],
  [7, 3],
  [7, 4],
  [7, 5]
]

const GROUPS = [
  { key: "bracketL", cols: 8, x: 0, depth: 0 },
  { key: "eyeL", cols: 9, x: 8, depth: 16 },
  { key: "mouth", cols: 8, x: 17, depth: 8 },
  { key: "eyeR", cols: 9, x: 25, depth: 16 },
  { key: "bracketR", cols: 7, x: 34, depth: 0 }
] as const

/** Pauses between idle moves (1.8–4.4 s, like the gif) and which move comes next: blinks each eye 3 times in 8, twitches the mouth twice. */
const IDLE_GAPS_MS = [2600, 3900, 2100, 4300, 3100, 1900, 3600, 2800, 4100, 2300, 3400]
const IDLE_ACTIONS = ["eyeL", "eyeR", "mouth", "eyeL", "eyeR", "eyeL", "mouth", "eyeR"] as const

function Pixels({ cells }: Readonly<{ cells: readonly Cell[] }>) {
  return (
    <>
      {cells.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={c * CELL} y={r * CELL} width={CELL} height={CELL} />
      ))}
    </>
  )
}

/** Renders nothing under prefers-reduced-motion (the gif stays); otherwise calls `onReady` once it has faded in, so the gif below can hide. */
export function MonsterFace({ className, onReady }: Readonly<{ className?: string; onReady?: () => void }>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const faceRef = useRef<HTMLDivElement>(null)
  const eyeLPupilRef = useRef<SVGGElement>(null)
  const eyeRPupilRef = useRef<SVGGElement>(null)
  const eyeLRingRef = useRef<SVGGElement>(null)
  const eyeLClosedRef = useRef<SVGGElement>(null)
  const eyeRRingRef = useRef<SVGGElement>(null)
  const eyeRClosedRef = useRef<SVGGElement>(null)
  const mouthBaseRef = useRef<SVGGElement>(null)
  const mouthVariantRef = useRef<SVGGElement>(null)

  useEffect(() => {
    const stage = rootRef.current
    const face = faceRef.current
    // Reduced motion keeps the gif: the face stays invisible and never reports ready
    if (!stage || !face || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const cleanups: Array<() => void> = []

    // fade in once painted, then let the gif below go
    const fadeIn = requestAnimationFrame(() => {
      stage.classList.remove("opacity-0")
      onReady?.()
    })
    cleanups.push(() => cancelAnimationFrame(fadeIn))

    // whole-face tilt toward the pointer
    let raf = 0
    let rx = 0
    let ry = 0
    const applyTilt = () => {
      face.style.transform = `rotateX(${ry}deg) rotateY(${rx}deg)`
      raf = 0
    }
    // The whole window steers it: the pointer's offset from the face's centre, against half the window
    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect()
      const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)))
      const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)))
      rx = nx * 12
      ry = -ny * 12
      if (!raf) raf = requestAnimationFrame(applyTilt)

      // pupils look toward the pointer a whole cell at a time, so they stay on the pixel grid
      const t = `translate(${Math.round(nx) * CELL}px,${Math.round(ny) * CELL}px)`
      if (eyeLPupilRef.current) eyeLPupilRef.current.style.transform = t
      if (eyeRPupilRef.current) eyeRPupilRef.current.style.transform = t
    }
    const onLeave = () => {
      rx = 0
      ry = 0
      if (!raf) raf = requestAnimationFrame(applyTilt)
      if (eyeLPupilRef.current) eyeLPupilRef.current.style.transform = ""
      if (eyeRPupilRef.current) eyeRPupilRef.current.style.transform = ""
    }
    // relax when the pointer leaves the window
    const onOut = (e: MouseEvent) => {
      if (!e.relatedTarget) onLeave()
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    document.addEventListener("mouseout", onOut)
    window.addEventListener("blur", onLeave)
    cleanups.push(() => {
      window.removeEventListener("pointermove", onMove)
      document.removeEventListener("mouseout", onOut)
      window.removeEventListener("blur", onLeave)
      cancelAnimationFrame(raf)
    })

    // idle blink / mouth twitch, same loose cadence as the source gif: fixed lists, no randomness needed
    let idleTimer = 0
    let blinkTimer = 0
    let beat = 0
    const show = (el: SVGGElement | null, visible: boolean) => {
      if (el) el.style.display = visible ? "" : "none"
    }
    const scheduleIdle = () => {
      const delay = IDLE_GAPS_MS[beat % IDLE_GAPS_MS.length]
      const action = IDLE_ACTIONS[beat % IDLE_ACTIONS.length]
      beat++
      idleTimer = window.setTimeout(() => {
        if (action === "eyeL") {
          show(eyeLRingRef.current, false)
          show(eyeLClosedRef.current, true)
          if (eyeLPupilRef.current) eyeLPupilRef.current.style.display = "none"
          blinkTimer = window.setTimeout(() => {
            show(eyeLRingRef.current, true)
            show(eyeLClosedRef.current, false)
            if (eyeLPupilRef.current) eyeLPupilRef.current.style.display = ""
          }, 130)
        } else if (action === "eyeR") {
          show(eyeRRingRef.current, false)
          show(eyeRClosedRef.current, true)
          if (eyeRPupilRef.current) eyeRPupilRef.current.style.display = "none"
          blinkTimer = window.setTimeout(() => {
            show(eyeRRingRef.current, true)
            show(eyeRClosedRef.current, false)
            if (eyeRPupilRef.current) eyeRPupilRef.current.style.display = ""
          }, 130)
        } else {
          show(mouthBaseRef.current, false)
          show(mouthVariantRef.current, true)
          blinkTimer = window.setTimeout(() => {
            show(mouthBaseRef.current, true)
            show(mouthVariantRef.current, false)
          }, 260)
        }
        scheduleIdle()
      }, delay)
    }
    scheduleIdle()
    cleanups.push(() => {
      window.clearTimeout(idleTimer)
      window.clearTimeout(blinkTimer)
    })

    return () => {
      for (const fn of cleanups) fn()
    }
  }, [onReady])

  return (
    <div
      ref={rootRef}
      className={cn("pointer-events-none text-fg opacity-0 transition-opacity duration-500", className)}
      style={{ perspective: 600 }}
      aria-hidden
    >
      <div
        ref={faceRef}
        className="relative size-full transition-transform duration-100 ease-out"
        style={{ transformStyle: "preserve-3d" }}
      >
        {GROUPS.map(g => (
          <svg
            key={g.key}
            aria-hidden
            viewBox={`0 0 ${g.cols * CELL} ${ROWS * CELL}`}
            className="absolute top-0 h-full"
            style={{
              left: `${(g.x / 41) * 100}%`,
              width: `${(g.cols / 41) * 100}%`,
              transform: `translateZ(${g.depth}px)`
            }}
          >
            <g fill="currentColor" shapeRendering="crispEdges">
              {g.key === "bracketL" && <Pixels cells={BRACKET_L} />}
              {g.key === "bracketR" && <Pixels cells={BRACKET_R} />}
              {g.key === "mouth" && (
                <>
                  <g ref={mouthBaseRef}>
                    <Pixels cells={MOUTH_BASE} />
                  </g>
                  <g ref={mouthVariantRef} style={{ display: "none" }}>
                    <Pixels cells={MOUTH_VARIANT} />
                  </g>
                </>
              )}
              {g.key === "eyeL" && (
                <>
                  <g ref={eyeLRingRef}>
                    <Pixels cells={EYE_L_RING} />
                  </g>
                  <g ref={eyeLPupilRef} className="transition-transform duration-75 ease-linear">
                    <Pixels cells={EYE_L_PUPIL} />
                  </g>
                  <g ref={eyeLClosedRef} style={{ display: "none" }}>
                    <Pixels cells={EYE_L_CLOSED} />
                  </g>
                </>
              )}
              {g.key === "eyeR" && (
                <>
                  <g ref={eyeRRingRef}>
                    <Pixels cells={EYE_R_RING} />
                  </g>
                  <g ref={eyeRPupilRef} className="transition-transform duration-75 ease-linear">
                    <Pixels cells={EYE_R_PUPIL} />
                  </g>
                  <g ref={eyeRClosedRef} style={{ display: "none" }}>
                    <Pixels cells={EYE_R_CLOSED} />
                  </g>
                </>
              )}
            </g>
          </svg>
        ))}
      </div>
    </div>
  )
}
