import type { HttpToolPackage, McpPackage } from "@kaja/schema/packages"

/** An enabled skill's catalog entry — all the model sees of it before calling load_skill. */
export type SkillSummary = {
  name: string
  description: string
  /** Absolute folder on disk, set only by folder-backed stores so the model can run bundled scripts by path. */
  dir?: string
  /** The skill's other files, relative to its folder (SKILL.md itself excluded). */
  files: string[]
}

/**
 * Where a host's enabled packages come from — a folder for the CLI
 * ({@link import("./folder-store").createFolderPackageStore}), Postgres for the API. The agent
 * never cares which.
 */
export type PackageStore = {
  /** Enabled, valid skills. Broken ones are skipped with a warning, never thrown. */
  listSkills(): Promise<SkillSummary[]>
  /**
   * An enabled skill's SKILL.md body (no `file`) or one of its other files, as text.
   * Undefined when the skill or file doesn't exist; throws {@link SkillFileError} when the file can't be served.
   */
  readSkill(name: string, file?: string): Promise<string | undefined>
  /** Enabled, valid HTTP tool packages. Broken ones are skipped with a warning, never thrown. */
  listHttpTools(): Promise<HttpToolPackage[]>
  /** Enabled, valid MCP server packages. Broken ones are skipped with a warning, never thrown. */
  listMcpPackages(): Promise<McpPackage[]>
}

/** A skill file that exists but can't be handed to the model — outside the skill folder, binary, or too large. */
export class SkillFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SkillFileError"
  }
}
