import { createBrowserLogger } from "@kaja/logger/browser"

export const logger = createBrowserLogger({
  app: "web",
  env: import.meta.env.MODE
})
