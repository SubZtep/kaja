import { expect, test } from "bun:test"
import { hackerNews, parseHackerNews } from "../../src/reading/hacker-news"
import reply from "./fixtures/hacker-news.json"

test("a search reply becomes stories with their discussion page; one without a link is left out", () => {
  const items = parseHackerNews(reply)
  expect(items).toHaveLength(3)
  expect(items[0]).toEqual({
    externalId: "50489641",
    title: "FAA issues national ground stop",
    url: "https://www.nbcnews.com/news/us-news/faa-orders-nationwide-ground-stop-departing-flights-reasons-safety-rcna609247",
    discussionUrl: "https://news.ycombinator.com/item?id=50489641",
    score: 1061,
    comments: 632,
    publishedAt: "2026-11-13T21:05:53.000Z"
  })
  expect(items.map(item => item.title)).not.toContain("U.S. October PPI Rises 6.5% YoY, Highest in Nearly Four Years")
})

test("a hit in an unknown shape is skipped, a reply in one is an error", () => {
  const hits = [
    { objectID: 7, title: "Numbers for ids" },
    { objectID: "8", title: " Fine ", url: "https://a.example/x", created_at_i: 1 }
  ]
  expect(parseHackerNews({ hits }).map(item => [item.externalId, item.title, item.score])).toEqual([["8", "Fine", 0]])
  expect(() => parseHackerNews({ error: "rate limited" })).toThrow("shape we don't know")
})

test("the list is one request for the stories since a time with enough points", async () => {
  const urls: URL[] = []
  const send = async (url: string | URL) => {
    urls.push(new URL(String(url)))
    return Response.json(reply)
  }
  const items = await hackerNews.fetch(send, new Date("2026-11-12T00:00:00Z"))
  expect(items).toHaveLength(3)
  expect(urls).toHaveLength(1)
  expect(hackerNews.hosts).toEqual([urls[0]!.hostname])
  expect(urls[0]!.pathname).toBe("/api/v1/search")
  expect(urls[0]!.searchParams.get("tags")).toBe("story")
  expect(urls[0]!.searchParams.get("numericFilters")).toBe("created_at_i>1794441600,points>=50")

  await expect(hackerNews.fetch(async () => new Response("slow down", { status: 429 }), new Date())).rejects.toThrow(
    "Hacker News answered 429"
  )
})
