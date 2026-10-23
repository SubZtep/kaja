import { describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { sql } from "../../src/core/db"
import { objects } from "../../src/core/files"
import {
  copyGooglePicture,
  fillFromGravatar,
  googlePictureUrl,
  gravatarHash,
  isGooglePicture
} from "../../src/features/auth/avatar"
import { signUpAndSignIn } from "./helpers"

// A 1×1 PNG, standing in for the picture Gravatar or Google would send.
const PNG = Uint8Array.fromBase64(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)

/** A fetch that answers from `routes` by URL prefix (404 otherwise) and records what was asked. */
function fakeFetch(routes: Record<string, () => Response>) {
  const asked: string[] = []
  const fetcher = async (url: string) => {
    asked.push(url)
    const route = Object.entries(routes).find(([prefix]) => url.startsWith(prefix))
    return route ? route[1]() : new Response(null, { status: 404 })
  }
  return { fetcher, asked }
}

const gravatar = (displayName?: string) =>
  fakeFetch({
    "https://api.gravatar.com/v3/profiles/": () =>
      displayName ? Response.json({ display_name: displayName }) : new Response(null, { status: 404 }),
    "https://gravatar.com/avatar/": () => new Response(PNG)
  })

async function newUser(name = "") {
  const email = faker.internet.email().toLowerCase()
  await signUpAndSignIn(email, name)
  const rows = await sql<{ id: string }[]>`SELECT id FROM "user" WHERE email = ${email}`
  return { id: rows[0]!.id, email }
}

async function profile(id: string) {
  const rows = await sql<{ name: string; image: string | null }[]>`SELECT name, image FROM "user" WHERE id = ${id}`
  return rows[0]!
}

// The object key behind a stored picture's public URL.
const keyOf = (url: string) => decodeURIComponent(url.slice(url.indexOf("images/")))

describe("avatar helpers", () => {
  test("Gravatar's hash ignores case and surrounding spaces", () => {
    expect(gravatarHash(" Ada@Example.COM ")).toBe(gravatarHash("ada@example.com"))
    expect(gravatarHash("ada@example.com")).toMatch(/^[0-9a-f]{64}$/)
  })

  test("a Google picture is asked for at avatar size", () => {
    expect(googlePictureUrl("https://lh3.googleusercontent.com/a/abc=s96-c")).toBe(
      "https://lh3.googleusercontent.com/a/abc=s256-c"
    )
  })

  test("only Google's picture hosts count as Google pictures", () => {
    expect(isGooglePicture("https://lh3.googleusercontent.com/a/abc=s96-c")).toBeTrue()
    expect(isGooglePicture("http://lh3.googleusercontent.com/a/abc")).toBeFalse()
    expect(isGooglePicture("https://googleusercontent.com.evil.example/a")).toBeFalse()
    expect(isGooglePicture("not a url")).toBeFalse()
  })
})

describe("Gravatar fill", () => {
  test("a blank name and picture come from the Gravatar profile, the picture stored in the bucket", async () => {
    const user = await newUser()
    const { fetcher, asked } = gravatar("Grav Atar")
    await fillFromGravatar(user, fetcher)

    const { name, image } = await profile(user.id)
    expect(name).toBe("Grav Atar")
    expect(keyOf(image!)).toStartWith(`images/${user.id}/avatar/`)
    expect(await objects.exists(keyOf(image!))).toBeTrue()
    expect(asked).toContain(`https://api.gravatar.com/v3/profiles/${gravatarHash(user.email)}`)
  })

  test("a name the user gave stays", async () => {
    const user = await newUser("Own Name")
    await fillFromGravatar(user, gravatar("Grav Atar").fetcher)
    expect((await profile(user.id)).name).toBe("Own Name")
  })

  test("an address without a Gravatar keeps a blank profile", async () => {
    const user = await newUser()
    await fillFromGravatar(user, fakeFetch({}).fetcher)
    expect(await profile(user.id)).toEqual({ name: "", image: null })
  })

  test("a failing Gravatar doesn't throw", async () => {
    const user = await newUser()
    await fillFromGravatar(user, async () => {
      throw new Error("offline")
    })
    expect(await profile(user.id)).toEqual({ name: "", image: null })
  })
})

describe("Google picture copy", () => {
  const picture = "https://lh3.googleusercontent.com/a/abc=s96-c"

  test("a new Google account's picture is swapped for a stored copy", async () => {
    const user = await newUser("Ada")
    await sql`UPDATE "user" SET image = ${picture} WHERE id = ${user.id}`
    const { fetcher, asked } = fakeFetch({ "https://lh3.googleusercontent.com/": () => new Response(PNG) })
    await copyGooglePicture(user.id, picture, picture, fetcher)

    const { image } = await profile(user.id)
    expect(keyOf(image!)).toStartWith(`images/${user.id}/avatar/`)
    expect(asked).toEqual(["https://lh3.googleusercontent.com/a/abc=s256-c"])
  })

  test("a picture the user changed meanwhile stays", async () => {
    const user = await newUser("Ada")
    await sql`UPDATE "user" SET image = 'https://example.com/me.png' WHERE id = ${user.id}`
    const { fetcher } = fakeFetch({ "https://lh3.googleusercontent.com/": () => new Response(PNG) })
    await copyGooglePicture(user.id, picture, picture, fetcher)
    expect((await profile(user.id)).image).toBe("https://example.com/me.png")
  })

  test("a URL off Google's hosts is never fetched", async () => {
    const user = await newUser("Ada")
    const { fetcher, asked } = fakeFetch({})
    await copyGooglePicture(user.id, "http://169.254.169.254/latest", "", fetcher)
    expect(asked).toEqual([])
  })
})
