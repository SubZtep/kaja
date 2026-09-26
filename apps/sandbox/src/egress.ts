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
/** The proxy traffic is chained through: where to connect, and the `Proxy-Authorization` value when it has credentials. */
type Upstream = { host: string; port: number; auth?: string }
type Deps = { allow: (address: string) => boolean; resolve: Resolve; counts: EgressCounts; upstream?: Upstream }

export type EgressOptions = {
  port: number
  /** Whether an upstream address may be reached; tests swap it to reach a local server. */
  allow?: (address: string) => boolean
  /** Resolves a hostname to its addresses; tests swap it. */
  resolve?: Resolve
  /** Counted into as connections come and go, for the sandbox's stats. */
  counts?: EgressCounts
  /** An `http://` proxy (the sandbox's WEB_PROXY) the checked traffic is tunnelled through; unset connects directly. */
  upstream?: string
}

/**
 * A forward proxy on 127.0.0.1 that the sandbox's browsers must go through (`--proxyServer` in overrides.json):
 * it resolves each host itself and connects only when every address is public, to the address it checked, so neither
 * a private IP, a name pointing at one, nor DNS rebinding reaches the host's own network or the cloud metadata service.
 * HTTPS and WebSockets come as CONNECT tunnels; plain HTTP is forwarded one request per connection.
 * With `upstream`, every connection instead goes through that proxy as a CONNECT tunnel to the checked address.
 */
export function startEgressProxy(opts: EgressOptions): Promise<Server> {
  const allow = opts.allow ?? (address => !isPrivateAddress(address))
  const resolve: Resolve =
    opts.resolve ?? (async hostname => (await lookup(hostname, { all: true })).map(r => r.address))
  const counts = opts.counts ?? { open: 0, allowed: 0, refused: 0, failed: 0 }
  const upstream = opts.upstream ? parseUpstream(opts.upstream) : undefined
  const server = createServer(client => serveClient(client, { allow, resolve, counts, upstream }))
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

  const via = deps.upstream
  const upstream = createConnection(via ? { host: via.host, port: via.port } : { host: address, port })
  upstream.setTimeout(CONNECT_TIMEOUT_MS, () => upstream.destroy(new Error("connect timeout")))
  let state: "connecting" | "open" | "done" = "connecting"
  // Before the path is open there is still an answer to give; after it, the tunnel or response just ends.
  const end = () => {
    if (state === "open") client.destroy()
    else if (state === "connecting") refuse(client, deps, 502, "Bad Gateway")
    state = "done"
  }
  upstream.once("error", end)
  upstream.once("close", end)
  const open = (early: Buffer) => {
    state = "open"
    deps.counts.allowed++
    deps.counts.open++
    upstream.once("close", () => deps.counts.open--)
    upstream.setTimeout(0)
    if (tunnel) client.write("HTTP/1.1 200 Connection Established\r\n\r\n")
    else upstream.write(originFormHead(method, url, version, headers))
    if (early.length) client.write(early)
    if (rest.length) upstream.write(rest)
    client.pipe(upstream)
    upstream.pipe(client)
    client.resume()
    upstream.resume()
  }
  upstream.once("connect", () => {
    if (!via) return open(Buffer.alloc(0))
    // The upstream proxy is given the address checked here, not the name, so it can't resolve to anything else.
    const host = isIP(address) === 6 ? `[${address}]` : address
    const authority = `${host}:${port}`
    const auth = via.auth ? `Proxy-Authorization: ${via.auth}\r\n` : ""
    upstream.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${auth}\r\n`)
    void readHead(upstream).then(answer => {
      if (answer && /^HTTP\/1\.[01] 200 /.test(answer.head)) open(answer.rest)
      else upstream.destroy()
    })
  })
  client.once("close", () => upstream.destroy())
}

/** Reads a response head off `socket` and pauses it; undefined when it closes first or the head is too big. */
function readHead(socket: Socket): Promise<{ head: string; rest: Buffer } | undefined> {
  return new Promise(done => {
    let buffer = Buffer.alloc(0)
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      const end = buffer.indexOf(HEAD_END)
      if (end === -1 && buffer.length <= MAX_HEAD_BYTES) return
      socket.off("data", onData)
      socket.pause()
      const head = buffer.subarray(0, end).toString("latin1")
      done(end === -1 ? undefined : { head, rest: buffer.subarray(end + HEAD_END.length) })
    }
    socket.on("data", onData)
    socket.once("close", () => done(undefined))
  })
}

/** Reads WEB_PROXY: `http://` only (the hop to it is plain TCP); credentials become a Basic `Proxy-Authorization`. */
export function parseUpstream(value: string): Upstream {
  const url = new URL(value)
  if (url.protocol !== "http:") throw new Error("WEB_PROXY must be an http:// proxy URL")
  const credentials = url.username ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}` : ""
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: Number(url.port || 80),
    auth: credentials ? `Basic ${Buffer.from(credentials).toString("base64")}` : undefined
  }
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
