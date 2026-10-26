// Used by CI (ci.yaml) via `bun --filter @kaja/web generate:paraglide`, where no Vite run compiles the messages.
import { compile } from "@inlang/paraglide-js"
import { paraglideOptions } from "../paraglide.config"

await compile(paraglideOptions)
