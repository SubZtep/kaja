import { expect, test } from "bun:test"
import { parseMatches } from "../../src/reading/discover"

const followed = ["AI agents", "Rust"]

test("picks are list positions with a followed topic, as the user spells it", () => {
  const reply = 'Here you go:\n{"matches": [{"n": 2, "topic": "ai  agents"}, {"n": 5, "topic": "Rust"}]}'
  expect(parseMatches(reply, 5, followed)).toEqual([
    { index: 1, topic: "AI agents" },
    { index: 4, topic: "Rust" }
  ])
})

test("a pick outside the list, twice, or under a topic that isn't followed is dropped", () => {
  const matches = [
    { n: 0, topic: "Rust" },
    { n: 6, topic: "Rust" },
    { n: 1.5, topic: "Rust" },
    { n: 3, topic: "Crypto" },
    { n: 2, topic: "Rust" },
    { n: 2, topic: "AI agents" }
  ]
  expect(parseMatches(JSON.stringify({ matches }), 5, followed)).toEqual([{ index: 1, topic: "Rust" }])
})

test("no picks is an answer; a reply without usable JSON is not", () => {
  expect(parseMatches('{"matches": []}', 5, followed)).toEqual([])
  expect(parseMatches("Nothing fits today.", 5, followed)).toBeUndefined()
  expect(parseMatches('{"matches": "none"}', 5, followed)).toBeUndefined()
  expect(parseMatches('{"matches": [', 5, followed)).toBeUndefined()
})
