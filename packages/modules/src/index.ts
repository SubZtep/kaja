export {
  defineManifest,
  defineModule,
  type Module,
  type ModuleContext,
  type ModuleManifest,
  type ModuleMigration,
  type ModuleModel
} from "./contract"
export { type ModuleSettings, moduleSettings } from "./core/settings"
export { MODULE_IDS, manifests, moduleMigrations } from "./manifest"
export { modulePromptSections, modules, moduleToolGroups } from "./registry"
