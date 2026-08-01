import { describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { db } from "../../src/core/db"

async function signUpAndIn() {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  const email = faker.internet.email({ firstName, lastName })
  const password = faker.internet.password({ length: 8, prefix: "P4$s" })
  const name = `${firstName} ${lastName}`

  const signUpRes = await app.request("/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name })
  })
  expect(signUpRes.status).toBe(200)

  const signInRes = await app.request("/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  })
  expect(signInRes.status).toBe(200)
  const data = await signInRes.json()
  expect(data.token).not.toBeEmpty()

  return { email, password, token: data.token as string, userId: data.user.id as string }
}

async function connectNode(token: string, name = "test-node") {
  const res = await app.request("/nodes/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name })
  })
  expect(res.status).toBe(200)
  const data = await res.json()
  return data.nodeId as string
}

describe("admin authorization", () => {
  test("unauthenticated admin command create returns 401", async () => {
    const res = await app.request("/admin/nodes/01945678-1234-7abc-9def-0123456789ab/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "echo", args: { message: "x" } })
    })
    expect(res.status).toBe(401)
  })

  test("node owner can list commands; other user cannot", async () => {
    const owner = await signUpAndIn()
    const other = await signUpAndIn()
    const nodeId = await connectNode(owner.token)

    const createRes = await app.request(`/admin/nodes/${nodeId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ command: "echo", args: { message: "hello" } })
    })
    expect(createRes.status).toBe(201)

    const ownerList = await app.request(`/admin/nodes/${nodeId}/commands`, {
      headers: { Authorization: `Bearer ${owner.token}` }
    })
    expect(ownerList.status).toBe(200)
    const ownerData = await ownerList.json()
    expect(ownerData.commands.length).toBeGreaterThanOrEqual(1)

    const otherList = await app.request(`/admin/nodes/${nodeId}/commands`, {
      headers: { Authorization: `Bearer ${other.token}` }
    })
    expect(otherList.status).toBe(404)

    const otherCreate = await app.request(`/admin/nodes/${nodeId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${other.token}` },
      body: JSON.stringify({ command: "echo", args: { message: "nope" } })
    })
    expect(otherCreate.status).toBe(404)
  })

  test("platform admin can list all active nodes; regular user cannot", async () => {
    const regular = await signUpAndIn()
    const admin = await signUpAndIn()
    await connectNode(regular.token, "regular-node")
    await connectNode(admin.token, "admin-node")

    await db.query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [admin.userId])

    // Re-sign-in so session carries updated role
    const signInRes = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: admin.email, password: admin.password })
    })
    expect(signInRes.status).toBe(200)
    const adminToken = (await signInRes.json()).token as string

    const denied = await app.request("/admin/nodes/all", {
      headers: { Authorization: `Bearer ${regular.token}` }
    })
    expect(denied.status).toBe(403)

    const allowed = await app.request("/admin/nodes/all", {
      headers: { Authorization: `Bearer ${adminToken}` }
    })
    expect(allowed.status).toBe(200)
    const data = await allowed.json()
    expect(Array.isArray(data.nodes)).toBeTrue()
    expect(data.nodes.length).toBeGreaterThanOrEqual(2)
  })

  test("platform admin can access another user's node commands", async () => {
    const owner = await signUpAndIn()
    const admin = await signUpAndIn()
    const nodeId = await connectNode(owner.token)

    await db.query(`UPDATE "user" SET role = 'admin' WHERE id = $1`, [admin.userId])
    const signInRes = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: admin.email, password: admin.password })
    })
    const adminToken = (await signInRes.json()).token as string

    const createRes = await app.request(`/admin/nodes/${nodeId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ command: "echo", args: { message: "admin-ok" } })
    })
    expect(createRes.status).toBe(201)

    const listRes = await app.request(`/admin/nodes/${nodeId}/commands`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    })
    expect(listRes.status).toBe(200)
  })
})
