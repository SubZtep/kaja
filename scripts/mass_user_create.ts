import { faker } from "@faker-js/faker"
import { SQL } from "bun"

// Sign-in is passwordless (an emailed code), so random users go straight into the database, consented and verified.
const count = Bun.argv[2] ?? ""
const NUMBER_OF_USERS = /^\d+$/.test(count) ? Number.parseInt(count, 10) : 10

if (!Bun.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set; run with --env-file=apps/api/.env")
  process.exit(1)
}

const sql = new SQL(Bun.env.DATABASE_URL)

for (let i = 0; i < NUMBER_OF_USERS; i++) {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  const name = faker.person.fullName({ firstName, lastName })
  const email = faker.internet.email({ firstName, lastName }).toLowerCase()
  await sql`INSERT INTO "user" (name, email, email_verified, consented_at) VALUES (${name}, ${email}, true, now())`
}

await sql.close()
console.log(`${NUMBER_OF_USERS} user${NUMBER_OF_USERS === 1 ? "" : "s"} created`)
