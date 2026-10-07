import { afterAll } from "bun:test"
import { mkdirSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// getPaths().temp comes from env-paths, which derives it from os.tmpdir() and honours no XDG_*
// variable — so unlike XDG_CONFIG_HOME/XDG_DATA_HOME it cannot be redirected per test file, and
// the suite would share the real temp dir with the user's own CLI (remote-fetch.ts caches its
// ETag there). env-paths also captures os.tmpdir() when it is first imported, and `bun test` runs
// every file in one process, so a per-file TMPDIR would leak whichever file imported it first to
// all the others — hence one dir per run, set here before any test module loads. Per run (keyed
// by pid) because test files build fixed paths under tmpdir(), so two runs at once (a hook and a
// terminal, say) would otherwise wipe each other's config dirs mid-test.
const PREFIX = "kaja-test-tmp-"
const root = tmpdir()

// A run killed before its exit hook leaves its dir behind; sweep those whose process is gone.
for (const name of readdirSync(root)) {
  const pid = Number(name.slice(PREFIX.length))
  if (name.startsWith(PREFIX) && Number.isInteger(pid) && !isAlive(pid)) {
    rmSync(join(root, name), { recursive: true, force: true })
  }
}

const testTmp = join(root, `${PREFIX}${process.pid}`)
// Tests call mkdtemp under it directly, so it must exist even on a fresh machine (CI).
mkdirSync(testTmp, { recursive: true })
Bun.env.TMPDIR = testTmp
// A KAJA_PROFILE from the user's shell would rename every config/data dir the tests expect.
delete Bun.env.KAJA_PROFILE
// A preload's afterAll runs once, after every test file (bun test fires no "exit" event).
afterAll(() => rmSync(testTmp, { recursive: true, force: true }))

function isAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: alive, just another user's
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}
