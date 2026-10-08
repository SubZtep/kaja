import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { SandboxEnvSchema } from "@kaja/schema/env"
import { shippedMarketplace } from "../../../scripts/lib/shipped-marketplace"
import { loadSandboxServers } from "../src/manifests"

// The kajaio/marketplace checkout's manifests with the image's overrides.json (`bun test:marketplace`).
const dir = shippedMarketplace()
const marketplace = dir ?? ""

describe.skipIf(!dir)("shipped marketplace in the image", () => {
  test("local-only servers, like filesystem, never run in a sandbox", async () => {
    const shipped = await loadSandboxServers(marketplace, join(import.meta.dir, "../overrides.json"))
    expect(shipped.has("chrome-devtools")).toBe(true)
    expect(shipped.has("filesystem")).toBe(false)
  })

  test("the image's Chrome only opens http(s) pages, never file://", async () => {
    const shipped = await loadSandboxServers(marketplace, join(import.meta.dir, "../overrides.json"))
    const args = shipped.get("chrome-devtools")!.args
    expect(args.filter(arg => arg.startsWith("--allowedUrlPattern="))).toEqual([
      "--allowedUrlPattern=http://*",
      "--allowedUrlPattern=https://*"
    ])
  })

  test("the image's Chrome goes out only through the egress proxy, loopback included", async () => {
    const shipped = await loadSandboxServers(marketplace, join(import.meta.dir, "../overrides.json"))
    const args = shipped.get("chrome-devtools")!.args
    const { SANDBOX_EGRESS_PORT } = SandboxEnvSchema.parse({})
    expect(args).toContain(`--proxyServer=http://127.0.0.1:${SANDBOX_EGRESS_PORT}`)
    expect(args).toContain("--chromeArg=--proxy-bypass-list=<-loopback>")
    expect(args).toContain("--chromeArg=--force-webrtc-ip-handling-policy=disable_non_proxied_udp")
  })
})
