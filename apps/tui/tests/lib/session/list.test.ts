import { expect, test } from "bun:test"
import type { SessionMeta } from "@kaja/schema/store"
import { formatSessionList } from "../../../lib/session/list"

const NOW = new Date("2026-09-23T12:00:00Z")

function meta(overrides: Partial<SessionMeta>): SessionMeta {
  return {
    id: "0199aaaa-0000-7000-8000-000000000001",
    createdAt: "2026-09-23T10:00:00Z",
    updatedAt: "2026-09-23T11:00:00Z",
    persona: "default",
    model: "chat",
    title: "hello",
    owner: null,
    ...overrides
  }
}

test("lists the terminal's sessions with their ids, in the given order, and a resume hint", () => {
  const text = formatSessionList(
    [
      meta({ id: "0199aaaa-0000-7000-8000-000000000002", persona: "care", title: "rough day" }),
      meta({ updatedAt: "2026-09-21T12:00:00Z", title: "disk space" })
    ],
    NOW
  )
  const lines = text.split("\n")
  expect(lines[0]).toStartWith("0199aaaa-0000-7000-8000-000000000002  1 hour ago")
  expect(lines[0]).toEndWith("care     rough day")
  expect(lines[1]).toStartWith("0199aaaa-0000-7000-8000-000000000001  2 days ago")
  expect(lines[1]).toEndWith("default  disk space")
  expect(text).toContain("kaja -s <id>")
})

test("leaves out other owners' sessions, which the terminal can't resume", () => {
  const text = formatSessionList([meta({ owner: "telegram:42", title: "from telegram" })], NOW)
  expect(text).not.toContain("from telegram")
  expect(text).toBe("No saved sessions yet.")
})

test("says so when there are no sessions", () => {
  expect(formatSessionList([], NOW)).toBe("No saved sessions yet.")
})
