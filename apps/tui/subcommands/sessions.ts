/**
 * `kaja sessions` — lists the terminal's saved local sessions with the ids `kaja -s <id>` resumes. Runs before the
 * local/cloud branch like `config`: it only reads the local SQLite file and never triggers cloud login.
 */
export async function runSessionsSubcommand() {
  const { listSessions } = await import("../lib/session/store")
  const { formatSessionList } = await import("../lib/session/list")
  console.log(formatSessionList(await listSessions()))
  process.exit(0)
}
