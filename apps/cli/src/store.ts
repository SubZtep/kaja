import { hostname } from "node:os"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { jsonFileStorage } from "./lib/local-store"

interface State {
  /** API generated node ID. */
  nodeId?: string

  /** User given name for the current CLI node. */
  nodeName: string
}

interface Actions {
  setNodeId: (nodeId: string) => void
  setNodeName: (nodeName: string) => void
}

type Store = State & Actions

const initialState: State = {
  nodeId: undefined,
  nodeName: hostname()
}

export const useStore = create<Store>()(
  persist(
    (set, _get) => ({
      ...initialState,
      setNodeId: nodeId => set({ nodeId }),
      setNodeName: nodeName => set({ nodeName })
    }),
    {
      name: "kaja-cli",
      storage: createJSONStorage(() => jsonFileStorage)
    }
  )
)
