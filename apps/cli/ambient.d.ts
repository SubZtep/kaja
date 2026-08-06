/** Ambient modules for Bun asset / text imports used by the CLI. */

declare module "*.wav" {
  const path: string
  export default path
}

declare module "*.mp3" {
  const path: string
  export default path
}

declare module "*.ogg" {
  const path: string
  export default path
}

declare module "*.toml" {
  const content: string
  export default content
}

declare module "*.json" {
  const content: unknown
  export default content
}
