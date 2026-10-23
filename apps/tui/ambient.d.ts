/** Ambient modules for Bun asset / text imports used by the CLI. */

declare module "*.toml" {
  const content: string
  export default content
}

declare module "*.json" {
  const content: unknown
  export default content
}
