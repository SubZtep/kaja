import { describe, expect, test } from "bun:test"
import { app } from "../../src/app"

describe("kaja cli client flow", () => {
  let nodeId: string

  test("connect node", async () => {
    const res = await app.request("/kaja/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-node" })
    })
    expect(res.ok).toBeTrue()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.nodeId).toBeTruthy()
    nodeId = data.nodeId
  })

  test("send heartbeat", async () => {
    const res = await app.request("/kaja/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId, status: "idle" })
    })
    expect(res.ok).toBeTrue()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBeTrue()
  })

  test("send heartbeat busy", async () => {
    const res = await app.request("/kaja/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: nodeId,
        status: "busy"
      })
    })
    expect(res.ok).toBeTrue()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBeTrue()
  })
})
