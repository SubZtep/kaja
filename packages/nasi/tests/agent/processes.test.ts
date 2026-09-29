import { expect, test } from "bun:test"
import { killTrackedProcesses, trackProcess } from "../../src/agent/processes"

test("killTrackedProcesses stops a tracked child that is still running", async () => {
  const proc = trackProcess(Bun.spawn(["sleep", "30"]))
  killTrackedProcesses()
  await proc.exited
  expect(proc.killed).toBe(true)
})
