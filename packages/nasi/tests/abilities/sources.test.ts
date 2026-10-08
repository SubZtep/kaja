import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import {
  fetchSources,
  MarketplaceSourceError,
  mergeSources,
  parseMarketplaceSource,
  parseMarketplaceSources,
  resolveSources
} from "../../src/abilities/sources"

const SHA_A = "a".repeat(40)
const SHA_B = "b".repeat(40)

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nasi-sources-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function put(rel: string, content: string) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/** A GitHub-shaped tarball: every file under one `<owner>-<repo>-<sha>/` folder. */
async function tarball(top: string, files: Record<string, string>): Promise<Uint8Array> {
  const prefixed = Object.fromEntries(Object.entries(files).map(([path, text]) => [`${top}/${path}`, text]))
  return new Bun.Archive(prefixed, { compress: "gzip" }).bytes()
}

type Call = { url: string; headers: Record<string, string> }

/** A fake GitHub: commit lookups answer from `commits`, tarball downloads from `tarballs`, keyed by repo. */
function fakeGithub(commits: Record<string, string>, tarballs: Record<string, Uint8Array>, calls: Call[] = []) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    const lookup = /api\.github\.com\/repos\/([^/]+\/[^/]+)\/commits\//.exec(url)
    if (lookup) {
      const sha = commits[lookup[1]!]
      return sha ? new Response(sha) : new Response("Not Found", { status: 404 })
    }
    const download =
      /(?:codeload\.github\.com\/([^/]+\/[^/]+)\/tar\.gz|api\.github\.com\/repos\/([^/]+\/[^/]+)\/tarball)\//.exec(url)
    const repo = download?.[1] ?? download?.[2]
    const bytes = repo ? tarballs[repo] : undefined
    return bytes
      ? new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]))
      : new Response("Not Found", { status: 404 })
  }) as typeof fetch
}

test("parses repos, refs and folders", () => {
  expect(parseMarketplaceSource("kajaio/marketplace")).toEqual({ repo: "kajaio/marketplace", ref: "main" })
  expect(parseMarketplaceSource(" kajaio/darkmarket#v2 ")).toEqual({ repo: "kajaio/darkmarket", ref: "v2" })
  expect(parseMarketplaceSource("../marketplace")).toEqual({ path: resolve("../marketplace") })
  expect(parseMarketplaceSource("~/abilities")).toEqual({ path: join(homedir(), "/abilities") })
  expect(() => parseMarketplaceSource("not a repo")).toThrow(MarketplaceSourceError)
  expect(parseMarketplaceSources("kajaio/marketplace, ,kajaio/darkmarket")).toHaveLength(2)
})

test("fetches a repo's tarball at its commit and keeps only the marketplace folders", async () => {
  const fetch = fakeGithub(
    { "kajaio/marketplace": SHA_A },
    {
      "kajaio/marketplace": await tarball(`kajaio-marketplace-${SHA_A.slice(0, 7)}`, {
        "abilities/notes/SKILL.md": "---\nname: notes\n---\n",
        "personas/default.toml": 'label = "D"\n',
        "datasets/onboarding.json": "{}",
        "README.md": "# Marketplace",
        ".github/workflows/ci.yaml": "on: push"
      })
    }
  )
  const out = join(root, "out")
  const result = await fetchSources([parseMarketplaceSource("kajaio/marketplace")], out, {
    workDir: join(root, "work"),
    fetch
  })
  expect(result.sources).toEqual([
    { source: { repo: "kajaio/marketplace", ref: "main" }, label: "kajaio/marketplace#main", commit: SHA_A }
  ])
  expect(existsSync(join(out, "abilities/notes/SKILL.md"))).toBe(true)
  expect(existsSync(join(out, "personas/default.toml"))).toBe(true)
  expect(existsSync(join(out, "datasets/onboarding.json"))).toBe(true)
  expect(existsSync(join(out, "README.md"))).toBe(false)
  expect(existsSync(join(out, ".github"))).toBe(false)
  expect(existsSync(join(root, "work"))).toBe(false)
})

test("a token goes to api.github.com for both the lookup and the tarball; without one, codeload serves it", async () => {
  const files = { "personas/p.toml": 'label = "P"\n' }
  const tarballs = {
    "kajaio/darkmarket": await tarball("top", files),
    "kajaio/marketplace": await tarball("top", files)
  }
  const commits = { "kajaio/darkmarket": SHA_B, "kajaio/marketplace": SHA_A }

  const withToken: Call[] = []
  await fetchSources([parseMarketplaceSource("kajaio/darkmarket")], join(root, "a"), {
    workDir: join(root, "wa"),
    token: "ghp_test",
    fetch: fakeGithub(commits, tarballs, withToken)
  })
  expect(withToken.map(call => new URL(call.url).host)).toEqual(["api.github.com", "api.github.com"])
  expect(withToken.every(call => call.headers.Authorization === "Bearer ghp_test")).toBe(true)

  const without: Call[] = []
  await fetchSources([parseMarketplaceSource("kajaio/marketplace")], join(root, "b"), {
    workDir: join(root, "wb"),
    fetch: fakeGithub(commits, tarballs, without)
  })
  expect(without.map(call => new URL(call.url).host)).toEqual(["api.github.com", "codeload.github.com"])
  expect(without.some(call => "Authorization" in call.headers)).toBe(false)
})

test("a missing or private repo says so", async () => {
  const fetch = fakeGithub({}, {})
  await expect(resolveSources([parseMarketplaceSource("kajaio/darkmarket")], { fetch })).rejects.toThrow(
    "kajaio/darkmarket#main not found (or private, and no token gives access)"
  )
})

test("a folder source is used as it is and has no commit; a missing one fails", async () => {
  put("local/personas/mine.toml", 'label = "M"\n')
  const out = join(root, "out")
  const result = await fetchSources([{ path: join(root, "local") }], out, { workDir: join(root, "work") })
  expect(result.sources[0]!.commit).toBeUndefined()
  expect(existsSync(join(out, "personas/mine.toml"))).toBe(true)
  expect(existsSync(join(root, "local/personas/mine.toml"))).toBe(true)
  await expect(resolveSources([{ path: join(root, "nope") }])).rejects.toThrow("doesn't exist")
})

test("a later source replaces an earlier one's ability folder whole, and personas per file", async () => {
  put("public/abilities/weather/tool.toml", "public tool")
  put("public/abilities/weather/SKILL.md", "public skill")
  put("public/abilities/time/mcp.toml", "time")
  put("public/personas/default.toml", "public default")
  put("public/personas/care.toml", "care")
  put("private/abilities/weather/tool.toml", "private tool")
  put("private/personas/default.toml", "private default")

  const out = join(root, "out")
  const { replaced } = await mergeSources(
    [
      { label: "public", dir: join(root, "public") },
      { label: "private", dir: join(root, "private") }
    ],
    out
  )
  expect(replaced).toEqual([
    { unit: "abilities/weather", by: "private" },
    { unit: "personas/default.toml", by: "private" }
  ])
  expect(await Bun.file(join(out, "abilities/weather/tool.toml")).text()).toBe("private tool")
  // The public SKILL.md doesn't survive inside the private ability.
  expect(existsSync(join(out, "abilities/weather/SKILL.md"))).toBe(false)
  expect(await Bun.file(join(out, "personas/default.toml")).text()).toBe("private default")
  expect(existsSync(join(out, "abilities/time/mcp.toml"))).toBe(true)
  expect(existsSync(join(out, "personas/care.toml"))).toBe(true)
})

test("merging empties the output first and keeps a script's exec bit", async () => {
  put("src/abilities/report/scripts/report.sh", "#!/bin/sh\n")
  Bun.spawnSync(["chmod", "755", join(root, "src/abilities/report/scripts/report.sh")])
  put("out/abilities/stale/SKILL.md", "old")
  const out = join(root, "out")
  await mergeSources([{ label: "src", dir: join(root, "src") }], out)
  expect(existsSync(join(out, "abilities/stale"))).toBe(false)
  expect(statSync(join(out, "abilities/report/scripts/report.sh")).mode & 0o777).toBe(0o755)
})
