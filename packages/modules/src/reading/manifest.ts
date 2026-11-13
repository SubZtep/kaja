import { defineManifest } from "../contract"
import { READING_SCHEMA } from "./schema"

export const readingManifest = defineManifest({
  id: "reading",
  migrations: [{ name: "2026-11-13-reading.sql", sql: READING_SCHEMA }]
})
