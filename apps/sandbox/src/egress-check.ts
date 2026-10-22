import { lookup } from "node:dns/promises"
import { connect } from "node:net"
import { isPrivateAddress } from "@kaja/shared/net"
import { parseUpstream, sendThroughEgress, startEgressProxy } from "./egress"
import { env } from "./env"

/**
 * `bun sandbox.js egress-check <url>`: sends one GET through a fresh egress proxy with this environment's WEB_PROXY,
 * printing each step, so an operator sees why tool requests fail. Exits 1 when the request doesn't get through.
 */
export async function runEgressCheck(target: string | undefined): Promise<void> {
  const url = target ? URL.parse(target) : null
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    console.error("Usage: bun sandbox.js egress-check <http(s) URL>")
    process.exit(2)
  }
  console.log(`WEB_PROXY  ${describeProxy(env.WEB_PROXY)}`)

  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = await resolve(hostname)

  const proxy = await startEgressProxy({ port: 0, upstream: env.WEB_PROXY })
  const port = (proxy.address() as { port: number }).port
  let ok = false
  let failure = ""
  try {
    const response = await sendThroughEgress(port)(new Request(url))
    const body = await response.arrayBuffer()
    const type = response.headers.get("content-type") ?? "no content type"
    console.log(`Request    ${response.status} ${response.statusText} (${type}, ${body.byteLength} bytes)`)
    ok = true
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
    console.log(`Request    failed: ${failure}`)
  } finally {
    proxy.close()
  }

  // The egress proxy asks WEB_PROXY for the address it checked; when WEB_PROXY refuses that, see whether the name would get through.
  if (failure.includes("WEB_PROXY answered") && env.WEB_PROXY) {
    const targetPort = Number(url.port || (url.protocol === "https:" ? 443 : 80))
    const [byAddress, byName] = await Promise.all([
      askUpstream(env.WEB_PROXY, `${bracketed(addresses[0] ?? "")}:${targetPort}`),
      askUpstream(env.WEB_PROXY, `${hostname}:${targetPort}`)
    ])
    console.log(`CONNECT    ${bracketed(addresses[0] ?? "")}:${targetPort} → ${byAddress}`)
    console.log(`CONNECT    ${hostname}:${targetPort} → ${byName}`)
  }
  process.exit(ok ? 0 : 1)
}

// WEB_PROXY without its password.
function describeProxy(proxy: string | undefined): string {
  if (!proxy) return "unset, connecting directly"
  const { protocol, host, username } = new URL(proxy)
  const credentials = username ? " (with credentials)" : ""
  return `${protocol}//${host}${credentials}`
}

// The host's addresses, printed with whether they're all public.
async function resolve(hostname: string): Promise<string[]> {
  const addresses = await lookup(hostname, { all: true }).then(
    found => found.map(entry => entry.address),
    error => {
      console.log(`Resolve    ${hostname}: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  )
  if (addresses.length) {
    const kind = addresses.every(address => !isPrivateAddress(address)) ? "public" : "includes a private address"
    console.log(`Resolve    ${hostname} → ${addresses.join(", ")} (${kind})`)
  }
  return addresses
}

function bracketed(address: string): string {
  return address.includes(":") ? `[${address}]` : address
}

// WEB_PROXY's status line for one CONNECT, or what went wrong reaching it.
function askUpstream(proxy: string, authority: string): Promise<string> {
  const upstream = parseUpstream(proxy)
  return new Promise(done => {
    let answer = ""
    const socket = connect(upstream.port, upstream.host, () => {
      const auth = upstream.auth ? `Proxy-Authorization: ${upstream.auth}\r\n` : ""
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${auth}\r\n`)
    })
    socket.setTimeout(10_000, () => socket.destroy(new Error("no answer in 10 s")))
    socket.on("data", chunk => {
      answer += chunk.toString("latin1")
      const line = answer.indexOf("\r\n")
      if (line === -1) return
      socket.destroy()
      done(answer.slice(0, line))
    })
    socket.once("error", error => done(error.message))
    socket.once("close", () => done(answer ? (answer.split("\r\n")[0] ?? "") : "closed without an answer"))
  })
}
