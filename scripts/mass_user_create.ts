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

const users = Array.from({ length: NUMBER_OF_USERS }, () => {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  return {
    name: faker.person.fullName({ firstName, lastName }),
    email: faker.internet.email({ firstName, lastName }).toLowerCase(),
    email_verified: true,
    consented_at: new Date()
  }
})
if (users.length > 0) await sql`INSERT INTO "user" ${sql(users)}`

await sql.close()
console.log(`${NUMBER_OF_USERS} user${NUMBER_OF_USERS === 1 ? "" : "s"} created`)
