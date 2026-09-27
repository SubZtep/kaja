import { timingSafeEqual } from "node:crypto"
import { SANDBOX_INSTANCE_HEADER, SANDBOX_KEY_HEADER, type SandboxFrame, sandboxFrameSchema } from "@kaja/schema/api"
import type { Context } from "hono"
import { getConnInfo, upgradeWebSocket } from "hono/bun"
import { createMiddleware } from "hono/factory"
import type { WSContext } from "hono/ws"
import { env } from "../../core/env"
import { lookupGeo } from "../../core/geo"
import { clientIp } from "../../core/rate-limit"
import { reportError } from "../../core/report"
import { sandboxService } from "../../services"
import type { SandboxOwner } from "../../services/sandbox"
import { addTunnel, removeTunnel } from "./registry"
import { SandboxTunnel } from "./tunnel"

/** A sandbox that connects must say hello this soon. */
const HELLO_TIMEOUT_MS = 10_000
/** Policy violation: a bad frame or no hello. */
const CLOSE_POLICY = 1008

type ConnectVariables = { sandboxOwner: SandboxOwner }

function sameKey(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Works out whose sandbox is connecting from its key: 401 for a key nobody has. */
export const sandboxOwnerMiddleware = createMiddleware<{ Variables: ConnectVariables }>(async (c, next) => {
  const key = c.req.header(SANDBOX_KEY_HEADER)?.trim()
  if (!key) {
    c.set("sandboxOwner", { kind: "anonymous" })
    return next()
  }
  if (env.SANDBOX_SYSTEM_KEY && sameKey(key, env.SANDBOX_SYSTEM_KEY)) {
    c.set("sandboxOwner", { kind: "official" })
    return next()
  }
  const userId = await sandboxService.userForKey(key)
  if (!userId) return c.json({ error: "unknown sandbox key" }, 401)
  c.set("sandboxOwner", { kind: "owned", userId })
  return next()
})

// The sandbox's public IP: the proxy's forwarded one, else the socket's own (a local dev stack).
function remoteIp(c: Context): string | undefined {
  const forwarded = clientIp(c)
  if (forwarded !== "unknown") return forwarded
  try {
    return getConnInfo(c).remote.address
  } catch {
    return undefined
  }
}

function parseFrame(data: unknown): SandboxFrame | undefined {
  if (typeof data !== "string") return undefined
  try {
    return sandboxFrameSchema.parse(JSON.parse(data))
  } catch {
    return undefined
  }
}

/** `GET /sandbox/connect`: a sandbox's WebSocket. It says hello, gets its id, then answers the API's requests over it. */
export const sandboxConnect = upgradeWebSocket((c: Context<{ Variables: ConnectVariables }>) => {
  const owner = c.get("sandboxOwner")
  const [instanceId, instanceSecret] = (c.req.header(SANDBOX_INSTANCE_HEADER) ?? "").split(".")
  const instance = instanceId && instanceSecret ? { id: instanceId, secret: instanceSecret } : undefined
  const ip = remoteIp(c)
  let tunnel: SandboxTunnel | undefined
  let registering = false
  let closed = false
  let helloTimer: ReturnType<typeof setTimeout> | undefined

  async function register(ws: WSContext, frame: Extract<SandboxFrame, { t: "hello" }>) {
    registering = true
    try {
      const geo = await lookupGeo(ip)
      const { id, secret } = await sandboxService.register({ owner, instance, info: frame.info, ip, geo })
      const registered = new SandboxTunnel({ id, info: frame.info, send: text => ws.send(text) })
      if (closed) {
        await sandboxService.setOffline(id)
        return
      }
      tunnel = registered
      addTunnel(registered)
      ws.send(JSON.stringify({ t: "welcome", id, ...(secret ? { secret } : {}) }))
      console.log("Sandbox connected", { id, kind: owner.kind, abilities: frame.info.abilities.length })
    } catch (error) {
      reportError("Couldn't register a sandbox", error)
      ws.close(1011, "registration failed")
    }
  }

  return {
    onOpen: (_event, ws) => {
      helloTimer = setTimeout(() => {
        if (!tunnel && !registering) ws.close(CLOSE_POLICY, "no hello")
      }, HELLO_TIMEOUT_MS)
    },
    onMessage: (event, ws) => {
      const frame = parseFrame(event.data)
      if (!frame) {
        ws.close(CLOSE_POLICY, "bad frame")
        return
      }
      if (frame.t === "hello") {
        clearTimeout(helloTimer)
        if (!tunnel && !registering) void register(ws, frame)
        return
      }
      if (!tunnel) return
      tunnel.receive(frame)
      if (frame.t === "heartbeat") {
        const id = tunnel.id
        sandboxService
          .heartbeat(id, frame.load)
          .catch(error => reportError("Couldn't record a heartbeat", error, { id }))
      }
    },
    onClose: () => {
      closed = true
      clearTimeout(helloTimer)
      if (!tunnel) return
      const { id } = tunnel
      removeTunnel(tunnel)
      sandboxService.setOffline(id).catch(error => reportError("Couldn't mark a sandbox offline", error, { id }))
      console.log("Sandbox disconnected", { id })
    }
  }
})
