import { randomBytes } from "node:crypto"
import { faker } from "@faker-js/faker"

const NUMBER_OF_USERS = /^\d+$/.test(Bun.argv[2]) ? Number.parseInt(Bun.argv[2], 10) : 10

for (let i = 0; i < NUMBER_OF_USERS; i++) {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()

  const res = await fetch("http://localhost:3001/auth/sign-up/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: faker.person.fullName({ firstName, lastName }),
      email: faker.internet.email({ firstName, lastName }),
      password: generatePassword()
    })
  })

  if (!res.ok) {
    // console.log("User add fail", await res.text())
    process.exit(1)
  }
}

console.log(`${NUMBER_OF_USERS} user${NUMBER_OF_USERS === 1 ? "" : "s"} created`)
process.exit(0)

/** Generates a random number from 0 to 1. */
export function random() {
  return randomBytes(1)[0] / 255
}

function generatePassword() {
  const shuffle = (str: string) =>
    str
      .split("")
      .sort(() => random() - 0.5)
      .join("")

  const base =
    faker.string.alpha({ length: 1, casing: "upper" }) +
    faker.string.alpha({ length: 1, casing: "lower" }) +
    faker.string.numeric(1) +
    faker.string.symbol(1) +
    faker.string.alphanumeric({ length: faker.number.int({ min: 4, max: 68 }) })

  return shuffle(base)
}
