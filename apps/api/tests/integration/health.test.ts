import { describe, expect, spyOn, test } from "bun:test"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import * as files from "../../src/core/files"

describe("health", () => {
  test("/health/ready is ok when the database and storage both answer", async () => {
    const res = await app.request("/health/ready")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "ok", database: "ok", storage: "ok" })
  })

  test("without storage it's degraded but still ready", async () => {
    const storage = spyOn(files, "storageReachable").mockResolvedValue(false)
    try {
      const res = await app.request("/health/ready")
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: "degraded", database: "ok", storage: "error" })
    } finally {
      storage.mockRestore()
    }
  })

  test("without the database it's down (503)", async () => {
    const query = spyOn(pool, "query").mockRejectedValue(new Error("connection refused") as never)
    try {
      const res = await app.request("/health/ready")
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ status: "down", database: "error", storage: "ok" })
    } finally {
      query.mockRestore()
    }
  })

  test("pool connections start in UTC with a statement timeout", async () => {
    const { rows } = await pool.query<{ zone: string; timeout: string }>(
      "SELECT current_setting('TimeZone') AS zone, current_setting('statement_timeout') AS timeout"
    )
    expect(rows[0]).toEqual({ zone: "UTC", timeout: "15s" })
  })
})
