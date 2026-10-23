type Killable = { kill(): unknown }

const tracked = new Set<Killable>()

/**
 * Registers a Bun child process so {@link killTrackedProcesses} can stop it on quit (with `kill`, when killing the
 * process alone isn't enough); returns it unchanged.
 */
export function trackProcess<T extends { kill(): unknown; exited: Promise<unknown> }>(
  proc: T,
  kill: () => unknown = () => proc.kill()
): T {
  const entry = { kill }
  tracked.add(entry)
  void proc.exited.then(() => tracked.delete(entry))
  return proc
}

/** Kills every tracked child that is still running. */
export function killTrackedProcesses() {
  for (const proc of tracked) proc.kill()
  tracked.clear()
}
