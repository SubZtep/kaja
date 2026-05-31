import { sql } from "drizzle-orm"
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth.schema"
import { node } from "./node.schema"

export const commandStatusEnum = ["pending", "executing", "completed", "failed", "timeout"] as const

export const command = pgTable(
  "command",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    nodeId: uuid("node_id")
      .notNull()
      .references(() => node.id, { onDelete: "cascade" }),
    command: text("command").notNull(),
    args: jsonb("args").default({}),
    timeoutSeconds: integer("timeout_seconds").default(300),
    status: text("status", { enum: commandStatusEnum }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    result: jsonb("result"),
    error: text("error"),
    exitCode: integer("exit_code"),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" })
  },
  table => [
    index("idx_command_node_id").on(table.nodeId),
    index("idx_command_status").on(table.status),
    index("idx_command_created_at").on(table.createdAt)
  ]
)

export type CommandRow = typeof command.$inferSelect
export type InsertCommand = typeof command.$inferInsert
