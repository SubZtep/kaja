import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { db } from "../../src/core/db"
import type { NodeEvent } from "../../src/services/events"
import { nodeEvents } from "../../src/services/events"
import { NodeService } from "../../src/services/node"

describe("SSE Event Emission", () => {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  const email = faker.internet.email({ firstName, lastName })
  const password = faker.internet.password({ length: 8, prefix: "P4$s" })
  let token: string
  let userId: string
  let nodeId: string
  let capturedEvents: NodeEvent[] = []

  // Event listener to capture emitted events
  const eventListener = (event: NodeEvent) => {
    capturedEvents.push(event)
  }

  beforeEach(() => {
    capturedEvents = []
    nodeEvents.on("node-update", eventListener)
  })

  afterEach(() => {
    nodeEvents.off("node-update", eventListener)
  })

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
    const data = await signInRes.json()
    token = data.token
    userId = data.user.id
    expect(token).not.toBeEmpty()
    expect(userId).not.toBeEmpty()
  })

  test("connect node emits 'connected' event with all fields", async () => {
    capturedEvents = []

    const res = await app.request("/nodes/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "test-node" })
    })
    expect(res.ok).toBeTrue()
    const data = await res.json()
    nodeId = data.nodeId

    // Verify event was emitted
    expect(capturedEvents).toHaveLength(1)
    const event = capturedEvents[0]

    // Verify event structure
    expect(event.type).toBe("connected")
    expect(event.userId).toBe(userId)
    expect(event.node).toBeDefined()
    expect(event.node.id).toBe(nodeId)
    expect(event.node.name).toBe("test-node")
    expect(event.node.status).toBe("idle")
    expect(event.node.lastSeen).toBeInstanceOf(Date)

    // CRITICAL: Verify geoLocation is included (even if null)
    expect(event.node).toHaveProperty("geoLocation")
  })

  test("heartbeat emits 'heartbeat' event", async () => {
    capturedEvents = []

    const res = await app.request("/nodes/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nodeId, status: "busy" })
    })
    expect(res.ok).toBeTrue()

    // Verify event was emitted (only if status changed)
    expect(capturedEvents).toHaveLength(1)
    const event = capturedEvents[0]

    expect(event.type).toBe("heartbeat")
    expect(event.userId).toBe(userId)
    expect(event.node.id).toBe(nodeId)
    expect(event.node.status).toBe("busy")
    expect(event.node).toHaveProperty("geoLocation")
  })

  test("heartbeat with same status does not emit event", async () => {
    capturedEvents = []

    // Send heartbeat with same status (busy)
    const res = await app.request("/nodes/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nodeId, status: "busy" })
    })
    expect(res.ok).toBeTrue()

    // Should not emit event (status didn't change)
    expect(capturedEvents).toHaveLength(0)
  })

  test("disconnect emits 'disconnected' event", async () => {
    capturedEvents = []

    const res = await app.request("/nodes/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nodeId })
    })
    expect(res.ok).toBeTrue()

    // Verify event was emitted
    expect(capturedEvents).toHaveLength(1)
    const event = capturedEvents[0]

    expect(event.type).toBe("disconnected")
    expect(event.userId).toBe(userId)
    expect(event.node.id).toBe(nodeId)
    expect(event.node.status).toBe("inactive")
    expect(event.node).toHaveProperty("geoLocation")
  })

  test("scheduler marks inactive nodes and emits 'inactive' event", async () => {
    // First, reconnect the node
    const reconnectRes = await app.request("/nodes/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "test-node-inactive-test" })
    })
    const reconnectData = await reconnectRes.json()
    const newNodeId = reconnectData.nodeId

    capturedEvents = []

    // Use NodeService directly to mark nodes inactive (simulating scheduler)
    const nodeService = new NodeService(db)

    // Mark nodes inactive that haven't sent heartbeat in last 0 seconds (forces all to be inactive)
    const markedCount = await nodeService.markInactiveNodes(0)

    expect(markedCount).toBeGreaterThan(0)
    expect(capturedEvents).toHaveLength(markedCount)

    // Find our test node's event
    const event = capturedEvents.find(e => e.node.id === newNodeId)
    expect(event).toBeDefined()
    expect(event?.type).toBe("inactive")
    expect(event?.userId).toBe(userId)
    expect(event?.node.status).toBe("inactive")
    expect(event?.node).toHaveProperty("geoLocation")
  })

  test("events are filtered by userId", async () => {
    // Create a second user
    const email2 = faker.internet.email()
    const password2 = faker.internet.password({ length: 8, prefix: "P4$s" })

    await app.request("/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email2, password: password2, name: "User 2" })
    })

    const signInRes2 = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email2, password: password2 })
    })
    const data2 = await signInRes2.json()
    const token2 = data2.token
    const userId2 = data2.user.id

    capturedEvents = []

    // User 1 connects a node
    await app.request("/nodes/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "user1-node" })
    })

    // User 2 connects a node
    await app.request("/nodes/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token2}` },
      body: JSON.stringify({ name: "user2-node" })
    })

    // Both events should be emitted (event emitter doesn't filter, SSE endpoint does)
    expect(capturedEvents).toHaveLength(2)

    // Verify events have correct userIds
    const user1Event = capturedEvents.find(e => e.userId === userId)
    const user2Event = capturedEvents.find(e => e.userId === userId2)

    expect(user1Event).toBeDefined()
    expect(user2Event).toBeDefined()
    expect(user1Event?.node.name).toBe("user1-node")
    expect(user2Event?.node.name).toBe("user2-node")
  })
})
