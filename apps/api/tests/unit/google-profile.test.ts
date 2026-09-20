import { expect, test } from "bun:test"
import { blankProfileFields, googleProfileFromIdToken } from "../../src/features/auth/google-profile"

const idToken = (claims: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`

test("reads name and picture from a Google id token", () => {
  expect(googleProfileFromIdToken(idToken({ name: " Ada Lovelace ", picture: "https://lh3.example/a.jpg" }))).toEqual({
    name: "Ada Lovelace",
    image: "https://lh3.example/a.jpg"
  })
})

test("a missing, malformed or claim-less token gives nothing", () => {
  expect(googleProfileFromIdToken(undefined)).toEqual({})
  expect(googleProfileFromIdToken("not-a-jwt")).toEqual({})
  expect(googleProfileFromIdToken("a.%%%.c")).toEqual({})
  expect(googleProfileFromIdToken(idToken({ name: 7 }))).toEqual({ name: undefined, image: undefined })
})

test("fills only what the user left blank", () => {
  const google = { name: "Ada Lovelace", image: "https://lh3.example/a.jpg" }
  expect(blankProfileFields({ name: "", image: null }, google)).toEqual(google)
  expect(blankProfileFields({ name: "   ", image: "" }, google)).toEqual(google)
  expect(blankProfileFields({ name: "Ada", image: null }, google)).toEqual({ image: google.image })
  expect(blankProfileFields({ name: "", image: "https://mine/x.png" }, google)).toEqual({ name: google.name })
  expect(blankProfileFields({ name: "Ada", image: "https://mine/x.png" }, google)).toEqual({})
})

test("does not copy values Google doesn't have", () => {
  expect(blankProfileFields({ name: "", image: null }, {})).toEqual({})
})
