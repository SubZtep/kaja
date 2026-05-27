import { createNodeLogger } from "@kaja/logger/node"

export const logger = createNodeLogger({
  app: "cli",
  env: process.env.NODE_ENV,
  level: "info"
})
