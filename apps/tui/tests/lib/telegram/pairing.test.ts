import { expect, test } from "bun:test"
import { createPairing, generatePairingCode, MAX_PAIRING_ATTEMPTS } from "../../../lib/telegram/pairing"

test("generatePairingCode gives XXXX-XXXX without look-alike characters", () => {
  for (let i = 0; i < 50; i++) expect(generatePairingCode()).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/)
})

test("owners pass; strangers are ignored while pairing is closed", () => {
  const pairing = createPairing({ ownerIds: [1], code: undefined })
  expect(pairing.check(1, "hi")).toBe("owner")
  expect(pairing.check(2, "hi")).toBe("ignore")
  expect(pairing.check(2, "/start ABCD-EFGH")).toBe("ignore")
})

test("the code pairs its sender once, from a deep link, a typed /start or the bare code", () => {
  for (const text of ["/start K7Q2-M9XD", "/start@my_bot K7Q2-M9XD", "k7q2m9xd", " K7Q2 M9XD "]) {
    const pairing = createPairing({ ownerIds: [], code: "K7Q2-M9XD" })
    expect(pairing.check(5, text)).toBe("paired")
    expect(pairing.isOwner(5)).toBe(true)
    expect(pairing.code).toBeUndefined()
    // Used up: nobody else can pair with it.
    expect(pairing.check(6, "/start K7Q2-M9XD")).toBe("ignore")
    expect(pairing.check(5, "hello")).toBe("owner")
  }
})

test("a user who sends too many wrong codes is ignored, even with the right one", () => {
  const pairing = createPairing({ ownerIds: [], code: "K7Q2-M9XD" })
  for (let i = 0; i < MAX_PAIRING_ATTEMPTS; i++) expect(pairing.check(9, `/start WRONG-${i}`)).toBe("ignore")
  expect(pairing.check(9, "/start K7Q2-M9XD")).toBe("ignore")
  // Only that user is locked out.
  expect(pairing.check(10, "/start K7Q2-M9XD")).toBe("paired")
})

test("a bare /start with no code is a wrong attempt, not a pairing", () => {
  const pairing = createPairing({ ownerIds: [], code: "K7Q2-M9XD" })
  expect(pairing.check(3, "/start")).toBe("ignore")
  expect(pairing.isOwner(3)).toBe(false)
})
