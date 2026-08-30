import { basename, join } from "node:path"
import { setDatasetLoaders } from "@kaja/nasi"
import { type Dataset, DatasetSchema } from "@kaja/schema/cli"
import { file } from "bun"
import { getConfigDir } from "../config/config"
import { log } from "../logger"

/** Loads ~/.config/kaja/datasets/*.json (filename = topic id). Invalid files are skipped with a warning. */
export async function loadDatasets(): Promise<Map<string, Dataset>> {
  const dir = join(getConfigDir(), "datasets")
  const glob = new Bun.Glob("*.json")
  const datasets = new Map<string, Dataset>()
  let entries: string[]
  try {
    entries = []
    for await (const match of glob.scan({ cwd: dir, dot: false })) {
      entries.push(match)
    }
  } catch {
    return datasets
  }
  for (const entry of entries.toSorted((a, b) => a.localeCompare(b))) {
    const path = join(dir, entry)
    const topic = basename(entry, ".json")
    try {
      const raw = await file(path).json()
      const dataset = DatasetSchema.parse(raw)
      datasets.set(topic, dataset)
    } catch (error) {
      log.warn({ error, path }, "Failed to load dataset")
    }
  }
  return datasets
}

export async function loadDataset(topic: string): Promise<Dataset | undefined> {
  const datasets = await loadDatasets()
  return datasets.get(topic)
}

setDatasetLoaders({ loadDatasets, loadDataset })
