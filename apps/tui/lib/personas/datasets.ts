import { readDatasets, setDatasetLoaders } from "@kaja/nasi"
import type { Dataset } from "@kaja/schema/cli"
import { getMarketplaceDir } from "../abilities/abilities-file"

/** Loads ~/.config/kaja/marketplace/datasets/*.json (filename = topic id), synced or your own. Invalid files are skipped with a warning. */
export function loadDatasets(): Promise<Map<string, Dataset>> {
  return readDatasets(getMarketplaceDir())
}

export async function loadDataset(topic: string): Promise<Dataset | undefined> {
  const datasets = await loadDatasets()
  return datasets.get(topic)
}

setDatasetLoaders({ loadDatasets, loadDataset })
