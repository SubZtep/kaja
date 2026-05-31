import { trace } from "@kaja/logger"

/** Logs HTTP request and response information. */
export function trafficLogger(message: string, ...rest: string[]) {
  trace(message, { rest })
}
