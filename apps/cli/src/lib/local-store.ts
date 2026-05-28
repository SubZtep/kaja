import fs from "node:fs/promises"
import path, { join } from "node:path"
import envPaths from "env-paths"
import type { StateStorage } from "zustand/middleware/persist"

const configFullPath = path.resolve(getConfigFullPath())

/** App config file path with filename. */
export function getConfigFullPath() {
  const paths = envPaths("kaja", { suffix: "" })
  return join(paths.config, "config.json")
}

/** Helper to ensure the JSON file exists so read operations don't crash */
async function ensureFile() {
  try {
    await fs.access(configFullPath)
  } catch {
    // If file doesn't exist, initialize it with an empty object
    await fs.writeFile(configFullPath, JSON.stringify({}), "utf-8")
  }
}

export const jsonFileStorage: StateStorage = {
  getItem: async name => {
    await ensureFile()
    const data = await fs.readFile(configFullPath, "utf-8")
    const db = JSON.parse(data)
    // Zustand expects stringified data or null if not found
    return db[name] || null
  },

  setItem: async (name, value) => {
    await ensureFile()
    const data = await fs.readFile(configFullPath, "utf-8")
    const db = JSON.parse(data)

    // Update the specific slice of state
    db[name] = value

    await fs.writeFile(configFullPath, JSON.stringify(db, null, 2), "utf-8")
  },

  removeItem: async name => {
    await ensureFile()
    const data = await fs.readFile(configFullPath, "utf-8")
    const db = JSON.parse(data)

    delete db[name]

    await fs.writeFile(configFullPath, JSON.stringify(db, null, 2), "utf-8")
  }
}

export async function deleteConfig() {
  const f = Bun.file(configFullPath)
  await f.delete()
}
