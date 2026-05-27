import { createNodeLogger } from "@kaja/logger/node"

export const logger = createNodeLogger({
  app: "api",
  env: process.env.NODE_ENV,
  level: "trace"
})

/** Logs HTTP request and response information. */
export function trafficLogger(message: string, ...rest: string[]) {
  logger.trace({ rest }, message)
}
