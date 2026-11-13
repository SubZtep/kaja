import type { PromptSection, ToolGroup } from "@kaja/nasi"
import type { Module, ModuleContext } from "./contract"
import { reading } from "./reading/module"

/** Every module a host loads. */
export const modules: readonly Module[] = [reading]

/**
 * Each module's tools as one group: official (their names are reserved) and sourced as the ability named after the
 * module, so a persona gets them by listing it.
 */
export function moduleToolGroups(ctx: ModuleContext, list: readonly Module[] = modules): ToolGroup[] {
  return list.map(module => ({ origin: "official", source: `ability:${module.id}`, tools: module.tools(ctx) }))
}

/** The modules' system prompt sections; nasi shows each only to a persona that has the section's tool. */
export function modulePromptSections(list: readonly Module[] = modules): PromptSection[] {
  return list.flatMap(module => module.prompt ?? [])
}
