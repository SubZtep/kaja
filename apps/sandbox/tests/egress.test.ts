import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { connect, createServer, type Server } from "node:net"
import { gzipSync } from "node:zlib"
import { type EgressCounts, parseUpstream, sendThroughEgress, startEgressProxy } from "../src/egress"

let upstream: ReturnType<typeof Bun.serve>
const proxies: Server[] = []

beforeAll(() => {
  upstream = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: request => {
      const url = new URL(request.url)
      if (url.pathname === "/moved") return new Response(null, { status: 302, headers: { location: "/elsewhere" } })
      if (url.pathname === "/gzip")
        return new Response(gzipSync("squeezed"), {
          headers: { "content-encoding": "gzip", "content-type": "text/plain" }
        })
      return Response.json({ path: `${url.pathname}${url.search}`, host: request.headers.get("host") })
    }
  })
})

afterAll(async () => {
  for (const proxy of proxies) proxy.close()
  await upstream.stop(true)
})

/** A proxy on a free port; `names` is its DNS, and by default only public addresses are allowed, as in production. */
async function proxy(
  opts: { names?: Record<string, string[]>; allowLoopback?: boolean; counts?: EgressCounts; upstream?: string } = {}
): Promise<number> {
  const server = await startEgressProxy({
    port: 0,
    counts: opts.counts,
    upstream: opts.upstream,
    ...(opts.allowLoopback ? { allow: () => true } : {}),
    resolve: async hostname => opts.names?.[hostname] ?? []
  })
  proxies.push(server)
  return (server.address() as { port: number }).port
}

/** Sends raw bytes to the proxy and collects everything it answers until it closes (or `until` matches). */
function exchange(port: number, data: string, until?: RegExp): Promise<string> {
  return new Promise((resolve, reject) => {
    let received = ""
    const socket = connect(port, "127.0.0.1", () => socket.write(data))
    socket.on("data", chunk => {
      received += chunk.toString()
      if (until?.test(received)) socket.end()
    })
    socket.on("close", () => resolve(received))
    socket.on("error", reject)
  })
}

describe("egress proxy", () => {
  test("a tunnel to loopback, the cloud metadata address or 0.0.0.0 is refused", async () => {
    const port = await proxy()
    for (const target of [`127.0.0.1:${upstream.port}`, "169.254.169.254:80", "0.0.0.0:80", "[::1]:443"]) {
      expect(await exchange(port, `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`)).toStartWith("HTTP/1.1 403")
    }
  })

  test("a name that resolves to a private address is refused, even alongside a public one", async () => {
    const port = await proxy({
      names: { "sneaky.test": ["93.184.215.14", "10.0.0.1"], "meta.test": ["169.254.169.254"] }
    })
    for (const host of ["sneaky.test", "meta.test"]) {
      expect(await exchange(port, `GET http://${host}/ HTTP/1.1\r\nHost: ${host}\r\n\r\n`)).toStartWith("HTTP/1.1 403")
    }
  })

  test("an unresolvable name, a non-http URL and a tunnel without a port are refused", async () => {
    const port = await proxy()
    expect(await exchange(port, "GET http://nowhere.test/ HTTP/1.1\r\nHost: nowhere.test\r\n\r\n")).toStartWith(
      "HTTP/1.1 403"
    )
    expect(await exchange(port, "GET ftp://example.com/ HTTP/1.1\r\n\r\n")).toStartWith("HTTP/1.1 400")
    expect(await exchange(port, "GET / HTTP/1.1\r\nHost: example.com\r\n\r\n")).toStartWith("HTTP/1.1 400")
    expect(await exchange(port, "CONNECT example.com HTTP/1.1\r\n\r\n")).toStartWith("HTTP/1.1 400")
  })

  test("plain HTTP is forwarded in origin form to the address the proxy resolved", async () => {
    const port = await proxy({ names: { "site.test": ["127.0.0.1"] }, allowLoopback: true })
    const host = `site.test:${upstream.port}`
    const answer = await exchange(
      port,
      `GET http://${host}/page?q=1 HTTP/1.1\r\nHost: ${host}\r\nProxy-Connection: keep-alive\r\n\r\n`
    )
    expect(answer).toStartWith("HTTP/1.1 200")
    expect(answer).toContain(JSON.stringify({ path: "/page?q=1", host }))
  })

  test("a CONNECT tunnel carries bytes both ways once it's open", async () => {
    const port = await proxy({ allowLoopback: true })
    const target = `127.0.0.1:${upstream.port}`
    const answer = await exchange(
      port,
      `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\nGET /tunnel HTTP/1.1\r\nHost: ${target}\r\nConnection: close\r\n\r\n`
    )
    expect(answer).toStartWith("HTTP/1.1 200 Connection Established\r\n\r\nHTTP/1.1 200")
    expect(answer).toContain('"path":"/tunnel"')
  })

  test("counts what it let through, refused and couldn't reach, and closes the count when a tunnel ends", async () => {
    const counts = { open: 0, allowed: 0, refused: 0, failed: 0 }
    const port = await proxy({ allowLoopback: true, counts })
    const target = `127.0.0.1:${upstream.port}`
    await exchange(
      port,
      `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\nGET / HTTP/1.1\r\nHost: ${target}\r\nConnection: close\r\n\r\n`
    )
    await exchange(port, "GET ftp://example.com/ HTTP/1.1\r\n\r\n")
    // Nothing listens on port 1.
    await exchange(port, "CONNECT 127.0.0.1:1 HTTP/1.1\r\n\r\n")
    const deadline = Date.now() + 5000
    while (counts.open > 0 && Date.now() < deadline) await Bun.sleep(20)
    expect(counts).toEqual({ open: 0, allowed: 1, refused: 1, failed: 1 })
  })
})

describe("egress proxy with an upstream proxy (WEB_PROXY)", () => {
  /** A raw upstream proxy that records the head it's sent and answers with `reply`. */
  async function recordingProxy(reply: string): Promise<{ port: number; heads: string[] }> {
    const heads: string[] = []
    const server = createServer(socket => {
      socket.once("data", chunk => {
        heads.push(chunk.toString("latin1"))
        socket.end(reply)
      })
    })
    await new Promise<void>(done => server.listen(0, "127.0.0.1", done))
    proxies.push(server)
    return { port: (server.address() as { port: number }).port, heads }
  }

  test("plain HTTP goes through the upstream as a tunnel to the checked address, keeping the Host header", async () => {
    const via = await proxy({ allowLoopback: true })
    const port = await proxy({
      names: { "site.test": ["127.0.0.1"] },
      allowLoopback: true,
      upstream: `http://127.0.0.1:${via}`
    })
    const host = `site.test:${upstream.port}`
    const answer = await exchange(port, `GET http://${host}/chained HTTP/1.1\r\nHost: ${host}\r\n\r\n`)
    expect(answer).toStartWith("HTTP/1.1 200")
    expect(answer).toContain(JSON.stringify({ path: "/chained", host }))
  })

  test("a CONNECT tunnel carries bytes both ways through the upstream", async () => {
    const via = await proxy({ allowLoopback: true })
    const counts = { open: 0, allowed: 0, refused: 0, failed: 0 }
    const port = await proxy({ allowLoopback: true, counts, upstream: `http://127.0.0.1:${via}` })
    const target = `127.0.0.1:${upstream.port}`
    const answer = await exchange(
      port,
      `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\nGET /tunnel HTTP/1.1\r\nHost: ${target}\r\nConnection: close\r\n\r\n`
    )
    expect(answer).toStartWith("HTTP/1.1 200 Connection Established\r\n\r\nHTTP/1.1 200")
    expect(answer).toContain('"path":"/tunnel"')
    expect(counts.allowed).toBe(1)
  })

  test("a private address is still refused, without asking the upstream", async () => {
    const recorder = await recordingProxy("HTTP/1.1 200 Connection Established\r\n\r\n")
    const port = await proxy({
      names: { "meta.test": ["169.254.169.254"] },
      upstream: `http://127.0.0.1:${recorder.port}`
    })
    expect(await exchange(port, "GET http://meta.test/ HTTP/1.1\r\nHost: meta.test\r\n\r\n")).toStartWith(
      "HTTP/1.1 403"
    )
    expect(recorder.heads).toEqual([])
  })

  test("the upstream is sent the checked IP with Basic credentials, and its refusal becomes a 502 that says why", async () => {
    const recorder = await recordingProxy("HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n")
    const counts = { open: 0, allowed: 0, refused: 0, failed: 0 }
    const port = await proxy({
      names: { "site.test": ["93.184.215.14"] },
      counts,
      upstream: `http://us%40er:p%3Ass@127.0.0.1:${recorder.port}`
    })
    expect(await exchange(port, "CONNECT site.test:443 HTTP/1.1\r\nHost: site.test:443\r\n\r\n")).toStartWith(
      "HTTP/1.1 502 Bad Gateway: WEB_PROXY answered HTTP/1.1 407 Proxy Authentication Required\r\n"
    )
    const [head = ""] = recorder.heads
    expect(head).toStartWith("CONNECT 93.184.215.14:443 HTTP/1.1\r\n")
    expect(head).toContain(`Proxy-Authorization: Basic ${Buffer.from("us@er:p:ss").toString("base64")}\r\n`)
    expect(counts).toEqual({ open: 0, allowed: 0, refused: 0, failed: 1 })
  })

  test("a tool request names the host and why WEB_PROXY failed it, never the URL's query", async () => {
    const recorder = await recordingProxy("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
    const send = sendThroughEgress(
      await proxy({ names: { "site.test": ["93.184.215.14"] }, upstream: `http://127.0.0.1:${recorder.port}` })
    )
    for (const scheme of ["http", "https"]) {
      const error = await send(new Request(`${scheme}://site.test/search?key=secret`)).catch((error: Error) => error)
      expect((error as Error).message).toBe("Couldn't connect to site.test: WEB_PROXY answered HTTP/1.1 403 Forbidden")
    }
    const closed = createServer()
    await new Promise<void>(done => closed.listen(0, "127.0.0.1", done))
    const deadPort = (closed.address() as { port: number }).port
    closed.close()
    const unreachable = sendThroughEgress(
      await proxy({ names: { "site.test": ["93.184.215.14"] }, upstream: `http://127.0.0.1:${deadPort}` })
    )
    await expect(unreachable(new Request("https://site.test/"))).rejects.toThrow(
      `Couldn't connect to site.test: WEB_PROXY: connect ECONNREFUSED 127.0.0.1:${deadPort}`
    )
  })

  test("only an http:// upstream is accepted", () => {
    expect(() => parseUpstream("https://proxy.example.com:8443")).toThrow()
    expect(parseUpstream("http://proxy.example.com:8080")).toEqual({
      host: "proxy.example.com",
      port: 8080,
      auth: undefined
    })
  })
})

describe("a cloud turn's tool request (sendThroughEgress)", () => {
  test("goes out through the proxy to the address it checked, one hop, with a decoded body", async () => {
    const send = sendThroughEgress(await proxy({ names: { "site.test": ["127.0.0.1"] }, allowLoopback: true }))
    const site = `http://site.test:${upstream.port}`
    expect(await (await send(new Request(`${site}/page?q=1`))).json()).toEqual({
      path: "/page?q=1",
      host: `site.test:${upstream.port}`
    })
    const moved = await send(new Request(`${site}/moved`))
    expect([moved.status, moved.headers.get("location")]).toEqual([302, "/elsewhere"])
    const gzipped = await send(new Request(`${site}/gzip`))
    expect(gzipped.headers.get("content-encoding")).toBeNull()
    expect(await gzipped.text()).toBe("squeezed")
  })

  test("a private address is refused, for http and https alike, and only http(s) goes out", async () => {
    const send = sendThroughEgress(await proxy({ names: { "inside.test": ["10.0.0.5"] } }))
    await expect(send(new Request(`http://127.0.0.1:${upstream.port}/`))).rejects.toThrow("Blocked non-public URL")
    await expect(send(new Request("http://inside.test/"))).rejects.toThrow("Blocked non-public URL")
    await expect(send(new Request("https://127.0.0.1:1/"))).rejects.toThrow("Blocked non-public URL")
    await expect(send(new Request("file:///etc/passwd"))).rejects.toThrow("Only http(s) URLs")
  })
})
