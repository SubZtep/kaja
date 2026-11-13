import { defineManifest } from "../contract"
import { READING_SCHEMA } from "./schema"

export const READING_ID = "reading"

export const readingManifest = defineManifest({
  id: READING_ID,
  migrations: [{ name: "2026-11-13-reading.sql", sql: READING_SCHEMA }]
})
