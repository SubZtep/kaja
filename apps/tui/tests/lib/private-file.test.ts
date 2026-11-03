import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makePrivate } from "../../src/lib/private-file"

const modeOf = async (path: string) => (await stat(path)).mode & 0o777

test.skipIf(process.platform === "win32")("takes group and other access away from a file and a folder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kaja-private-"))
  const file = join(dir, "secrets.toml")
  await writeFile(file, "")
  await chmod(file, 0o644)
  const folder = join(dir, "data")
  await mkdir(folder)
  await chmod(folder, 0o755)

  await makePrivate(file)
  await makePrivate(folder)

  expect(await modeOf(file)).toBe(0o600)
  expect(await modeOf(folder)).toBe(0o700)
})

test.skipIf(process.platform === "win32")("leaves an owner-only mode as it is", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "kaja-private-")), "run.sh")
  await writeFile(file, "")
  await chmod(file, 0o700)
  await makePrivate(file)
  expect(await modeOf(file)).toBe(0o700)
})

test("a missing path is no error", async () => {
  await expect(makePrivate(join(tmpdir(), `kaja-private-missing-${Math.random()}`))).resolves.toBeUndefined()
})
