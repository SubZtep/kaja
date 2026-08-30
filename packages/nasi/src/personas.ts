import type { Dataset } from "@kaja/schema/cli"

export type DatasetLoaders = {
  loadDatasets: () => Promise<Map<string, Dataset>>
  loadDataset: (topic: string) => Promise<Dataset | undefined>
}

let loaders: DatasetLoaders = {
  loadDatasets: async () => new Map(),
  loadDataset: async () => undefined
}

export function setDatasetLoaders(next: DatasetLoaders) {
  loaders = next
}

export async function loadDatasets() {
  return loaders.loadDatasets()
}

export async function loadDataset(topic: string) {
  return loaders.loadDataset(topic)
}
