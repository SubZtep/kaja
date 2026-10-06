type Killable = { kill(): unknown }

const tracked = new Set<Killable>()

/** Registers a Bun child process so {@link killTrackedProcesses} can stop it on quit (with `kill`, when killing the process alone isn't enough); returns it unchanged. */
export function trackProcess<T extends { kill(): unknown; exited: Promise<unknown> }>(
  proc: T,
  kill: () => unknown = () => proc.kill()
): T {
  const entry = { kill }
  tracked.add(entry)
  void proc.exited.then(() => tracked.delete(entry))
  return proc
}

/** Same for a Node child process (what `play-sound` spawns); a missing one (spawn failed) is ignored. */
export function trackChild<T extends Killable & { once(event: "exit", listener: () => void): unknown }>(
  child: T | null | undefined
): T | null | undefined {
  if (!child) return child
  tracked.add(child)
  child.once("exit", () => tracked.delete(child))
  return child
}

/** Kills every tracked child that is still running. */
export function killTrackedProcesses() {
  for (const proc of tracked) proc.kill()
  tracked.clear()
}
