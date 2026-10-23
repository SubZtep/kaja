import { expect, test } from "bun:test"
import type { NasiTurnResponse } from "@kaja/schema/nasi"
import { offeredOptions } from "../../widgets/src/client"

const turn = (status: NasiTurnResponse["status"], steps: NasiTurnResponse["steps"]): NasiTurnResponse => ({
  session: "01900000-0000-7000-8000-000000000000",
  status,
  message: "",
  steps
})

test("the options of the question the turn ended on are offered", () => {
  const steps = [{ type: "ask_user" as const, question: "Proceed?", options: ["Yes", "No"], fromTool: true as const }]
  expect(offeredOptions(turn("needs_input", steps))).toEqual(["Yes", "No"])
})

test("the last question counts when a turn asked more than one", () => {
  const steps = [
    { type: "ask_user" as const, question: "First?", options: ["A", "B"] },
    { type: "ask_user" as const, question: "Second?", options: ["C", "D"] }
  ]
  expect(offeredOptions(turn("needs_input", steps))).toEqual(["C", "D"])
})

test("nothing is offered for a question without options, or when no answer is awaited", () => {
  expect(offeredOptions(turn("needs_input", [{ type: "ask_user", question: "Why?" }]))).toEqual([])
  const steps = [{ type: "ask_user" as const, question: "Proceed?", options: ["Yes", "No"] }]
  expect(offeredOptions(turn("completed", steps))).toEqual([])
  expect(offeredOptions(turn("needs_input", [{ type: "message", content: "hi" }]))).toEqual([])
})
