import type { Persona, SamplingParams } from "@kaja/schema/cli"

/** Pulls a persona's optional sampling overrides into an Agent-shaped object. */
export function samplingOf(persona?: Persona): SamplingParams | undefined {
  if (!persona) return undefined
  const { temperature, top_p, max_tokens, frequency_penalty, presence_penalty, seed } = persona
  const sampling = {
    temperature,
    top_p,
    max_tokens,
    frequency_penalty,
    presence_penalty,
    seed
  }
  return Object.values(sampling).some(v => v !== undefined) ? sampling : undefined
}
