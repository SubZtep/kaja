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
})
