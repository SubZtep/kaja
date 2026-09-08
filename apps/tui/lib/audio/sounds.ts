import playSoundLib from "play-sound"
import bell from "../../assets/sounds/333695__khrinx__thin-bell-ding-2.wav" with { type: "file" }
import keyboard from "../../assets/sounds/391310__pfranzen__hitting-the-enter-key-on-a-keyboard.ogg" with {
  type: "file"
}
import magic from "../../assets/sounds/628548__gmlh__icemagic.mp3" with { type: "file" }
import error from "../../assets/sounds/662346__fmaudio__interface-error-7.wav" with { type: "file" }
import wind from "../../assets/sounds/817959__jriches1__whoosh-away.mp3" with { type: "file" }
import hehe from "../../assets/sounds/818171__sadiquecat__sadiquecat-mke600-laughing-nervous-laugh-hehe.wav" with {
  type: "file"
}
import { log } from "../logger"

const soundFile = { bell, magic, wind, hehe, error, keyboard } as const

const player = playSoundLib()

export async function playSound(sound: keyof typeof soundFile) {
  const path = soundFile[sound]

  await new Promise<void>(resolve => {
    player.play(path, err => {
      if (err) log.error("Failed to play sound", { sound, err })
      resolve()
    })
  })
}
