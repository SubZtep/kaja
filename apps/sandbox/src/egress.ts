import { lookup } from "node:dns/promises"
import { createConnection, createServer, isIP, type Server, type Socket } from "node:net"
import type { SandboxStats } from "@kaja/schema/api"
import { isPrivateAddress } from "@kaja/shared"

/** A request head bigger than this is refused. */
const MAX_HEAD_BYTES = 16 * 1024
const CONNECT_TIMEOUT_MS = 10_000
const HEAD_END = "\r\n\r\n"
/** Hop-by-hop headers a forwarded plain-HTTP request drops; `Connection: close` replaces them. */
const HOP_HEADERS = new Set(["connection", "keep-alive", "proxy-connection", "proxy-authorization"])

type Resolve = (hostname: string) => Promise<string[]>
/** Connections open now, and ones let through, refused and failed upstream since the proxy started. */
export type EgressCounts = SandboxStats["egress"]
type Deps = { allow: (address: string) => boolean; resolve: Resolve; counts: EgressCounts }

export type EgressOptions = {
  port: number
  /** Whether an upstream address may be reached; tests swap it to reach a local server. */
  allow?: (address: string) => boolean
  /** Resolves a hostname to its addresses; tests swap it. */
  resolve?: Resolve
  /** Counted into as connections come and go, for the sandbox's stats. */
  counts?: EgressCounts
}

/**
 * A forward proxy on 127.0.0.1 that the sandbox's browsers must go through (`--proxyServer` in overrides.json):
 * it resolves each host itself and connects only when every address is public, to the address it checked, so neither
 * a private IP, a name pointing at one, nor DNS rebinding reaches the host's own network or the cloud metadata service.
 * HTTPS and WebSockets come as CONNECT tunnels; plain HTTP is forwarded one request per connection.
 */
export function startEgressProxy(opts: EgressOptions): Promise<Server> {
  const allow = opts.allow ?? (address => !isPrivateAddress(address))
  const resolve: Resolve =
    opts.resolve ?? (async hostname => (await lookup(hostname, { all: true })).map(r => r.address))
  const counts = opts.counts ?? { open: 0, allowed: 0, refused: 0, failed: 0 }
  const server = createServer(client => serveClient(client, { allow, resolve, counts }))
  return new Promise((done, fail) => {
    server.once("error", fail)
    server.listen(opts.port, "127.0.0.1", () => done(server))
  })
}

function serveClient(client: Socket, deps: Deps) {
  let head = Buffer.alloc(0)
  client.on("error", () => client.destroy())
  const onData = (chunk: Buffer) => {
    head = Buffer.concat([head, chunk])
    const end = head.indexOf(HEAD_END)
    if (end === -1) {
      if (head.length > MAX_HEAD_BYTES) refuse(client, deps, 431, "Request Header Fields Too Large")
      return
    }
    client.off("data", onData)
    client.pause()
    const rest = head.subarray(end + HEAD_END.length)
    void forward(client, head.subarray(0, end).toString("latin1"), rest, deps)
  }
  client.on("data", onData)
}

async function forward(client: Socket, head: string, rest: Buffer, deps: Deps) {
  const [requestLine = "", ...headers] = head.split("\r\n")
  const [method = "", target = "", version = "HTTP/1.1"] = requestLine.split(" ")
  const tunnel = method.toUpperCase() === "CONNECT"
  const url = parseTarget(tunnel ? `http://${target}` : target)
  // A CONNECT target always names its port; URL drops a default one (`:80`), so it's read from the target itself.
  const port = tunnel ? Number(/:(\d+)$/.exec(target)?.[1]) : Number(url?.port || 80)
  if (!url || (!tunnel && url.protocol !== "http:") || !port) return refuse(client, deps, 400, "Bad Request")

  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = isIP(hostname) ? [hostname] : await deps.resolve(hostname).catch(() => [])
  const address = addresses[0]
  if (!address || !addresses.every(deps.allow)) return refuse(client, deps, 403, "Forbidden")

  const upstream = createConnection({ host: address, port })
  upstream.setTimeout(CONNECT_TIMEOUT_MS, () => upstream.destroy(new Error("connect timeout")))
  let connected = false
  // Before the connection there is still an answer to give; after it, the tunnel or response just ends.
  upstream.once("error", () => (connected ? client.destroy() : refuse(client, deps, 502, "Bad Gateway")))
  upstream.once("connect", () => {
    connected = true
    deps.counts.allowed++
    deps.counts.open++
    upstream.once("close", () => deps.counts.open--)
    upstream.setTimeout(0)
    if (tunnel) client.write("HTTP/1.1 200 Connection Established\r\n\r\n")
    else upstream.write(originFormHead(method, url, version, headers))
    if (rest.length) upstream.write(rest)
    client.pipe(upstream)
    upstream.pipe(client)
    client.resume()
  })
  client.once("close", () => upstream.destroy())
  upstream.once("close", () => connected && client.destroy())
}

function parseTarget(target: string): URL | undefined {
  try {
    return new URL(target)
  } catch {
    return undefined
  }
}

// `GET http://host/path` as a proxy receives it becomes `GET /path`, and the connection ends with the answer, so the next request (maybe to another host) is checked again.
function originFormHead(method: string, url: URL, version: string, headers: string[]): string {
  const kept = headers.filter(line => !HOP_HEADERS.has(line.slice(0, line.indexOf(":")).trim().toLowerCase()))
  return [`${method} ${url.pathname}${url.search} ${version}`, ...kept, "Connection: close", "", ""].join("\r\n")
}

function refuse(client: Socket, deps: Deps, status: number, reason: string) {
  deps.counts[status === 502 ? "failed" : "refused"]++
  client.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}
