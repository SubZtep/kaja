import { sql } from "drizzle-orm"
import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const user = pgTable("user", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  role: text("role"),
  banned: boolean("banned"),
  banReason: text("banReason"),
  banExpires: timestamp("banExpires", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow()
})

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    impersonatedBy: uuid("impersonatedBy"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow()
  },
  table => [index("session_userId_idx").on(table.userId)]
)

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow()
  },
  table => [index("account_userId_idx").on(table.userId)]
)

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow()
  },
  table => [index("verification_identifier_idx").on(table.identifier)]
)

export const deviceCode = pgTable(
  "deviceCode",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    deviceCode: text("deviceCode").notNull().unique(),
    userCode: text("userCode").notNull().unique(),
    userId: uuid("userId").references(() => user.id, { onDelete: "cascade" }),
    clientId: text("clientId"),
    scope: text("scope"),
    status: text("status").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    lastPolledAt: timestamp("lastPolledAt", { withTimezone: true }),
    pollingInterval: integer("pollingInterval")
  },
  table => [index("deviceCode_userId_idx").on(table.userId), index("deviceCode_expiresAt_idx").on(table.expiresAt)]
)
