import { Text } from "ink"
import { useEffect, useState, useSyncExternalStore } from "react"
import { type HookName, onHook } from "../../lib/config/hooks"

const IDLE = "༼☉ɷ⊙༽"
const WAND = "🪄"

type Frame = readonly [face: string, hold: number]

// Each plays from the idle face and falls back to it
const ANIMATIONS = {
  blink: [["༼–ɷ⊙༽", 120]],
  smile: [
    ["༼☉ω⊙༽", 250],
    ["༼☉ɷ⊙༽", 150],
    ["༼☉ω⊙༽", 250]
  ],
  wink: [
    ["༼–ɷ⊙༽", 150],
    ["༼☉ɷ⊙༽", 150],
    ["༼☉ɷ–༽", 150]
  ]
} as const satisfies Record<string, readonly Frame[]>

type IdleAnimation = keyof typeof ANIMATIONS

const FACES = {
  asking: "༼☉ω⊙༽",
  checking: "༼•ω•༽",
  worked: "༼^ω^༽",
  problem: "༼°ω°༽"
} as const

/** A face the monster pulls when something happens, see {@link emote}. */
export type Mood = keyof typeof FACES

const EMOTE_MS = 1200

const MOOD_OF_HOOK: Partial<Record<HookName, Mood>> = {
  question: "asking",
  confirm: "asking",
  tool_call: "checking",
  message: "worked",
  error: "problem"
}

let emotion: Mood | null = null
let calmDown: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function setEmotion(next: Mood | null) {
  emotion = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Every mounted monster shows `mood` for `ms`, then goes back to what it was doing; a newer emote replaces it. */
export function emote(mood: Mood, ms = EMOTE_MS) {
  clearTimeout(calmDown)
  setEmotion(mood)
  calmDown = setTimeout(() => setEmotion(null), ms)
  calmDown.unref()
}

// Every hook reacts on the face, hooks.toml or not
onHook(name => {
  const mood = MOOD_OF_HOOK[name]
  if (mood) emote(mood)
})

/** Columns the monster takes, so layouts can reserve its room. */
export function monsterWidth(wand = false): number {
  return Bun.stringWidth(IDLE) + (wand ? Bun.stringWidth(WAND) : 0)
}

/** Weighted: mostly blinks, occasional personality */
function pick(): IdleAnimation {
  const r = Math.random() // NOSONAR: animation flavor, not security-sensitive
  if (r < 0.75) return "blink"
  if (r < 0.9) return "smile"
  return "wink"
}

/** 4s - 10s */
function idleGap(): number {
  return 4000 + Math.random() * 6000 // NOSONAR: animation flavor, not security-sensitive
}

// The idle face with a random animation every few seconds, while `active`
function useIdleFace(active: boolean): string {
  const [face, setFace] = useState<string>(IDLE)

  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout>
    const play = (frames: readonly Frame[], step = 0) => {
      const frame = frames[step]
      if (!frame) {
        setFace(IDLE)
        timer = setTimeout(() => play(ANIMATIONS[pick()]), idleGap())
        return
      }
      setFace(frame[0])
      timer = setTimeout(() => play(frames, step + 1), frame[1])
    }
    // Starts from the idle face, even when an emote cut the last animation short
    play([])
    return () => clearTimeout(timer)
  }, [active])

  return face
}

/**
 * The monster. With a `mood` it holds that face, without one it idles with the odd blink; an {@link emote} shows over
 * either for a moment. `wand` adds the wizard's wand. It is a `<Text>`, so it sits inline in other text.
 */
export function Monster({ mood, wand = false }: Readonly<{ mood?: Mood; wand?: boolean }>) {
  const current = useSyncExternalStore(subscribe, () => emotion)
  const idle = useIdleFace(!current && !mood)
  const shown = current ?? mood
  return (
    <Text>
      {shown ? FACES[shown] : idle}
      {wand ? WAND : ""}
    </Text>
  )
}
