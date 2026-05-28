import { describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"

describe("kaja cli client flow", () => {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  const email = faker.internet.email({ firstName, lastName })
  const password = faker.internet.password({ length: 8, prefix: "P4$s" })
  let token: string
  let nodeId: string

  test("authenticate user", async () => {
    const signUpRes = await app.request("/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: `${firstName} ${lastName}` })
    })
    expect(signUpRes.status).toBe(200)

    const signInRes = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    })
    expect(signInRes.status).toBe(200)
    token = (await signInRes.json()).token
    expect(token).not.toBeEmpty()
  })

  test("connect node", async () => {
    const res = await app.request("/kaja/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

  test("create command for node - should fail with non-allowlisted command", async () => {
    const res = await app.request(`/kaja/admin/nodes/${nodeId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ command: "rm", args: {} })
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain("not permitted")
  })

  test("create command for node - should succeed with allowlisted command", async () => {
    const res = await app.request(`/kaja/admin/nodes/${nodeId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ command: "echo", args: { message: "hello" } })
    })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.command).toBe("echo")
    expect(data.status).toBe("pending")
  })

  test("create command with shell injection attempt - should fail", async () => {
    const res = await app.request(`/kaja/admin/nodes/${nodeId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ command: "echo", args: { message: "hello; rm -rf /" } })
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain("dangerous characters")
  })

  test("heartbeat with unknown node - should return 404", async () => {
    const fakeNodeId = "01945678-1234-7abc-9def-0123456789ab"
    const res = await app.request("/kaja/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nodeId: fakeNodeId, status: "idle" })
    })
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toContain("Unknown node")
  })

  test("disconnect node", async () => {
    const res = await app.request("/kaja/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nodeId })
    })
    expect(res.ok).toBeTrue()
    expect(res.status).toBe(200)
  })

  test("create command for inactive node - should fail", async () => {
    const res = await app.request(`/kaja/admin/nodes/${nodeId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ command: "echo", args: {} })
    })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain("inactive")
  })
})
