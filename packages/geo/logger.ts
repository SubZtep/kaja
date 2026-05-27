import { createNodeLogger } from "@kaja/logger/node"

export const logger = createNodeLogger({
  app: "geo",
  env: process.env.NODE_ENV,
  level: "trace"
})
