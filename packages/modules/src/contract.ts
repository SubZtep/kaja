import type { FetchLike, ModelCallUsage, NasiToolDeps, PromptSection, Tool } from "@kaja/nasi"
import type { SQL } from "bun"

/** What a host hands a module for one user. */
export type ModuleContext = {
  /** The host's database (Postgres in the API); the module's statements stay in the dialect it shares with SQLite. */
  sql: SQL
  /** Every statement is scoped to this account. */
  userId: string
  /** Sends the module's web requests (the cloud: through the turn's sandbox); unset connects from this host. */
  send?: FetchLike
  /** A model for the module's own calls (the `summarize` task's, else the chat's); without one such steps are skipped. */
  model?: ModuleModel
  /** The account's language as a locale (`hu-HU`), for text a module writes for the user; unset means English. */
  language?: string
}

export type ModuleModel = NonNullable<NasiToolDeps["summarizer"]>

/** What a user's job gets: the account's context, as a turn's tools get it, without a conversation around it. */
export type UserJobContext = ModuleContext & {
  /** Reports a model call the job made, so the account's usage counts it. */
  onModelCall?: (usage: ModelCallUsage) => void
  /** Aborts when the run has taken too long. */
  signal: AbortSignal
}

/** What a job that runs once for everyone gets. `send` connects from the host and reaches only the job's `hosts`. */
export type GlobalJobContext = { sql: SQL; send: FetchLike; signal: AbortSignal }

/** `done` drops the job's row: it runs again only once something schedules it. */
export type JobResult = "done" | undefined

type JobBase = {
  /** Unique within the module. */
  id: string
  /** How long after a run the next one is due. */
  everyMinutes: number
}

/** Work a module does without a turn; the host's runner calls `run` when the job's row is due. */
export type ModuleJob =
  | (JobBase & {
      /** One row per account, made by `scheduleJob`. */
      scope: "user"
      run(ctx: UserJobContext): Promise<JobResult>
    })
  | (JobBase & {
      /** One row for everyone, made by the runner. */
      scope: "global"
      /** The only hosts the job's requests may go to (https). */
      hosts: string[]
      run(ctx: GlobalJobContext): Promise<JobResult>
    })

/** One file's worth of DDL; a module's own name for it, unique within the module. */
export type ModuleMigration = { name: string; sql: string }

/** What a module is without its code: enough to migrate a database, or to know the module exists. */
export type ModuleManifest = {
  /** Kebab-case. Also the ability personas list to get its tools, and the prefix of its tables (`-` as `_`). */
  id: string
  /** Postgres DDL, applied in order after the host's own migrations. */
  migrations: ModuleMigration[]
}

/** A feature with its own tables and agent tools, loaded by a host from the registry's list. */
export type Module = ModuleManifest & {
  /** The module's agent tools for one user's turn. Building them does no I/O. */
  tools(ctx: ModuleContext): Tool[]
  /**
   * A system prompt section for the persona that has `tool` (one of the module's). Static, so the prompt stays
   * cacheable.
   */
  prompt?: PromptSection
  /** Background work, run by the host's job runner. */
  jobs?: ModuleJob[]
}

/** The name the module system's own migrations go under; no module may take it. */
export const CORE_ID = "core"

const MODULE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/** Checks a manifest where it is written, so a bad id fails at import, not in a user's turn. */
export function defineManifest(manifest: ModuleManifest): ModuleManifest {
  if (!MODULE_ID.test(manifest.id)) throw new Error(`Module id must be kebab-case: ${manifest.id}`)
  if (manifest.id === CORE_ID) throw new Error(`"${CORE_ID}" names the module system's own tables`)
  const names = new Set(manifest.migrations.map(migration => migration.name))
  if (names.size !== manifest.migrations.length) throw new Error(`Module ${manifest.id} names a migration twice`)
  return manifest
}

/** A module: its manifest plus the code a host runs. */
export function defineModule(manifest: ModuleManifest, code: Omit<Module, keyof ModuleManifest>): Module {
  const jobs = new Set(code.jobs?.map(job => job.id))
  if (jobs.size !== (code.jobs?.length ?? 0)) throw new Error(`Module ${manifest.id} names a job twice`)
  return { ...manifest, ...code }
}
