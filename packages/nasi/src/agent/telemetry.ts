import type { CallStat, Session, SessionTelemetry, StepStat } from "./agent"

function telemetryOf(session: Session): SessionTelemetry {
  session.telemetry ??= { steps: [], calls: {} }
  return session.telemetry
}

/** Whole milliseconds since a `performance.now()` reading. */
export function msSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt)
}

export function recordStep(session: Session, stat: StepStat): void {
  telemetryOf(session).steps.push(stat)
}

/** Adds to what's known about a call, so the run that made it and the turn that answers it can each contribute. */
export function recordCall(session: Session, callId: string, stat: CallStat): void {
  const telemetry = telemetryOf(session)
  telemetry.calls[callId] = { ...telemetry.calls[callId], ...stat }
}

/**
 * Records how the human's answer to a paused call went: declined, skipped (they typed instead), or approved and run
 * (`startedAt` is when it began, `status` how it ended). Call it before the answer reaches run(), which clears the pending id.
 */
export function recordPausedCall(
  session: Session,
  kind: "run_command" | "tool_approval",
  answer: "declined" | "skipped" | { status: "ok" | "error"; startedAt: number }
): void {
  const callId = kind === "run_command" ? session.pendingRunCommandId : session.pendingToolApprovalId
  if (!callId) return
  if (answer === "declined") recordCall(session, callId, { status: "declined", approval: "declined" })
  else if (answer === "skipped") recordCall(session, callId, { status: "skipped" })
  else
    recordCall(session, callId, { status: answer.status, approval: "approved", durationMs: msSince(answer.startedAt) })
}
