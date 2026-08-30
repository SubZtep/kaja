// Text-to-speech via speaches: streams raw PCM to an AudioSink as it synthesizes.
//
// Usage:
//   const { speak } = createTts(sink)
//   await speak("Hello there")
//
// Model must be pulled once:
//   curl -X POST localhost:8000/v1/models/speaches-ai/Kokoro-82M-v1.0-ONNX-fp16

import type { PersonaModels } from "@kaja/schema/cli"
import { config } from "../config/config"
import { log } from "../logger"
import { loadModelsFile, resolveActiveModel } from "../models/models"
import type { AudioSink } from "./audio"

async function resolveTtsSettings(personaModels?: PersonaModels) {
  const { tts } = await config()
  const resolved = resolveActiveModel(await loadModelsFile(), "text-to-speech", personaModels)
  if (!resolved || !tts?.voice) {
    throw new Error(
      "No TTS model/voice configured — set [active].text-to-speech in models.toml and tts.voice in settings.toml"
    )
  }
  return {
    model: resolved.model,
    voice: tts.voice,
    // speachesUrl is a ws:// URL (matching the speaches realtime API); TTS uses plain HTTP.
    base: (tts.speachesUrl ?? "ws://localhost:8000").replace(/^ws/, "http")
  }
}

export async function fetchSpeech(
  text: string,
  personaModels?: PersonaModels
): Promise<{ response: Response; voice: string }> {
  const { model, voice, base } = await resolveTtsSettings(personaModels)
  const res = await fetch(`${base}/v1/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      warmupTts: true,
      warmupStt: true,
      onmessage: (msg: any) => {
        if (msg.type === "warmup_done") {
          log.debug("tts: warmup done")
        } else if (msg.type === "warmup_error") {
          log.warn(
            {
              msg
            },
            "tts: warmup error"
          )
        }
      },
      response_format: "pcm" // s16le mono 24kHz (its wav output minus the header)
    })
  })
  if (!res.ok) throw new Error(`TTS failed: ${res.status} ${await res.text()}`)
  if (!res.body) throw new Error("TTS returned no audio")
  return { response: res, voice }
}

// Logs time-to-first-audio, the number the whole streaming design exists for.
async function* logFirstChunk(
  pcm: AsyncIterable<Uint8Array>,
  started: number,
  voice: string
): AsyncIterable<Uint8Array> {
  let first = true
  for await (const chunk of pcm) {
    if (first) {
      first = false
      log.info(
        {
          first_audio_s: +((Date.now() - started) / 1000).toFixed(1)
        },
        "tts: speaking"
      )
    }
    yield chunk
  }
  log.debug(
    {
      synth_s: +((Date.now() - started) / 1000).toFixed(1),
      voice
    },
    "tts: utterance synthesized"
  )
}

export function createTts(sink: AudioSink, personaModels?: PersonaModels) {
  // Serializes synthesis+consumption across speak() calls so utterances never
  // interleave in the sink and the server synthesizes one at a time.
  let queue: Promise<unknown> = Promise.resolve()

  function speak(text: string): Promise<void> {
    const step = queue.then(async () => {
      const started = Date.now()
      const { response, voice } = await fetchSpeech(text, personaModels)
      const utterance = sink.play(logFirstChunk(response.body as unknown as AsyncIterable<Uint8Array>, started, voice))
      await utterance.consumed // ordering + backpressure; next synthesis may start
      // Wrapped: returning the bare promise would make the queue await audible completion and kill synthesis/playback pipelining.
      return {
        done: utterance.done
      }
    })
    queue = step.catch(() => {})
    // Resolve when the audio is audibly done, not when it was handed to the sink; the next queued utterance starts synthesizing without waiting.
    return step.then(({ done }) => done)
  }

  return { speak }
}

/** Load the TTS model server-side so the first real reply doesn't pay for it. */
export async function warmupTts(personaModels?: PersonaModels): Promise<void> {
  try {
    const { response } = await fetchSpeech("Hi", personaModels)
    await response.arrayBuffer() // discard — we only want the model loaded
    log.debug("tts: warmed up")
  } catch (err) {
    log.warn(err, "tts: warmup failed")
  }
}
