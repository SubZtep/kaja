import { expect, test } from "bun:test"
import { urlKey } from "../../src/reading/url"

test("one page under different links has one key: scheme, www, fragment, trailing slash and tracking aside", () => {
  const key = "example.com/posts/agents"
  for (const url of [
    "https://example.com/posts/agents",
    "http://www.example.com/posts/agents/",
    "https://EXAMPLE.com/posts/agents#comments",
    "  https://example.com/posts/agents?utm_source=hn&utm_medium=social&fbclid=abc  "
  ])
    expect(urlKey(url)).toBe(key)
})

test("the query that names the page stays, in a fixed order", () => {
  expect(urlKey("https://news.ycombinator.com/item?id=42")).toBe("news.ycombinator.com/item?id=42")
  expect(urlKey("https://example.com/search?q=kaja&page=2")).toBe(urlKey("https://example.com/search?page=2&q=kaja"))
  expect(urlKey("https://example.com/a")).not.toBe(urlKey("https://example.com/b"))
  expect(urlKey("https://example.com")).toBe("example.com")
})

test("anything but an http(s) link has no key", () => {
  for (const url of ["", "example.com/a", "ftp://example.com/a", "javascript:alert(1)", "file:///etc/passwd"])
    expect(urlKey(url)).toBeUndefined()
})
