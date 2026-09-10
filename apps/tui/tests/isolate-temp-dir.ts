import { tmpdir } from "node:os"
import { join } from "node:path"

// getPaths().temp comes from env-paths, which derives it from os.tmpdir() and honours no XDG_*
// variable — so unlike XDG_CONFIG_HOME/XDG_DATA_HOME it cannot be redirected per test file, and
// the suite would share the real temp dir with the user's own CLI (remote-fetch.ts caches its
// ETag there). env-paths also captures os.tmpdir() when it is first imported, and `bun test` runs
// every file in one process, so a per-file TMPDIR would leak whichever file imported it first to
// all the others — hence one fixed dir set here, before any test module loads. Fixed rather than
// mkdtemp'd so repeated runs reuse it instead of littering /tmp.
Bun.env.TMPDIR = join(tmpdir(), "kaja-test-tmp")
