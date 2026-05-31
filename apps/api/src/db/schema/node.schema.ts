import { sql } from "drizzle-orm"
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth.schema"

export const nodeStatusEnum = ["idle", "busy", "inactive"] as const

export const node = pgTable(
  "node",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    geoLocation: jsonb("geo_location"),
    status: text("status", { enum: nodeStatusEnum }).notNull().default("idle"),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  table => [
    index("node_user_id_idx").on(table.userId),
    index("node_status_idx").on(table.status),
    index("node_last_seen_idx").on(table.lastSeen)
  ]
)

export type Node = typeof node.$inferSelect
export type NewNode = typeof node.$inferInsert
