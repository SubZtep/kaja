import { cancel, isCancel, log, select, text } from "@clack/prompts"
import { getTimeAgo } from "@kaja/shared"
import ollama, { type ModelResponse, Ollama } from "ollama"
import { readConfig, writeConfig } from "./config"

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function fail(message: string) {
  cancel(message)
  throw new Error(message)
}

export async function configFlow() {
  const existing = readConfig()
  const configuredHost = existing.ollama?.host?.trim()
  const configuredModel = existing.ollama?.model?.trim()

  let models: ModelResponse[] | undefined
  let selectedHost = configuredHost

  if (configuredHost) {
    try {
      const res = await new Ollama({ host: configuredHost }).list()
      models = res.models
    } catch (error: unknown) {
      log.warn(`Configured host unreachable: ${errorMessage(error)}`)
    }
  }

  if (!models || models.length === 0) {
    try {
      const res = await ollama.list()
      models = res.models
      selectedHost = undefined
    } catch (error: unknown) {
      log.error(errorMessage(error))
    }
  }

  if (!models || models.length === 0) {
    const url = await text({
      message: "Enter the URL of your Ollama instance",
      placeholder: configuredHost ?? "http://localhost:11434"
    })
    if (isCancel(url)) {
      fail("No URL provided")
    }
    const trimmed = url.trim()
    if (!trimmed) {
      fail("Empty URL provided")
    }
    selectedHost = trimmed
    const remote = new Ollama({ host: selectedHost })
    try {
      const res = await remote.list()
      models = res.models
    } catch (error: unknown) {
      fail(errorMessage(error))
    }
  }

  models = models
    ?.filter(model => !("remote_host" in model && model.remote_host))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (!models || models.length === 0) {
    fail("No models found")
  }

  let model: ModelResponse | undefined
  if (models.length === 1) {
    model = models[0]
  } else if (configuredModel) {
    model = models.find(entry => entry.name === configuredModel)
  }

  if (!model && models.length > 1) {
    const selected = await select({
      maxItems: 15,
      message: "Select your preferred model",
      options: models.map(model => ({
        value: model,
        label: model.name,
        hint: [
          model.details.parameter_size,
          model.details.quantization_level,
          getTimeAgo(new Date(model.modified_at))
        ].join(" · ")
      }))
    })

    if (isCancel(selected)) {
      fail("No model selected")
    }
    model = selected
  }

  await writeConfig({
    ollama: {
      host: selectedHost,
      model: model?.name
    }
  })
  log.success(`Saved model: ${model?.name}`)
}
