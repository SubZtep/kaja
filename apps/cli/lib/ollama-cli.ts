import type { JobData } from "@kaja/schemas"
import { $ } from "bun"

/** Thin wrapper around the `ollama` shell command. */
export class OllamaCliClient {
  async ping() {
    try {
      await $`ollama -v`.quiet()
    } catch {
      return false
    }
    return true
  }

  async listModels() {
    const res = await $`ollama list`.quiet()
    return res.stdout
      .toString()
      .split("\n")
      .slice(1)
      .map(line => line.split(" ")[0].trim())
      .filter(Boolean)
  }

  async runJob(job: JobData) {
    const res = await $`ollama run ${job.payload.model} """${job.payload.prompt}""" --nowordwrap --think=false`.quiet()
    return res.stdout.toString().trim()
  }
}
