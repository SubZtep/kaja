/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket URL with port */
  readonly VITE_WSPP: string
  readonly VITE_WASM: string
  readonly VITE_TASK: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

type Fn = () => void

type TickFn = (deltaTime: number) => void

type Landmark = import("@mediapipe/tasks-vision").NormalizedLandmark

type Angles = Record<string, number[]>

type State = typeof import("./state").state

interface Player {
  id: string
  colour: string
  landmarks?: Landmark[]
  angles?: Angles
}
