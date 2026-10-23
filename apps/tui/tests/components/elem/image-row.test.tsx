import { expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ImageRow } from "../../../components/elem/image-row"
import { sourceName } from "../../../lib/image/source"
import { png } from "../../fixtures/images"
import { renderForTest } from "../../test-utils"

const path = join(tmpdir(), `kaja-image-row-${Bun.randomUUIDv7()}.png`)
await Bun.write(path, await png(40, 20))

test("an image's source is named by its site, else its file", () => {
  expect(sourceName({ url: "https://www.Example.com/a/b.png", fileName: "b.png" })).toBe("example.com")
  expect(sourceName({ fileName: "shot.png" })).toBe("shot.png")
  expect(sourceName({ url: "not a url" })).toBe("not a url")
  expect(sourceName(undefined)).toBeUndefined()
})

test("the row shows where the image came from, the site linked to the whole URL", async () => {
  const row = renderForTest(
    <ImageRow path={path} text="A red square." source={{ url: "https://www.example.com/sq.png" }} />,
    { columns: 120, rows: 20 }
  )
  await row.tick()
  const frame = row.lastFrame() ?? ""
  expect(frame).toContain("A red square.")
  expect(frame).toContain("example.com")
  expect(frame).toContain("\u001B]8;;https://www.example.com/sq.png\u0007")
  row.unmount()
  await row.waitUntilExit()

  const file = renderForTest(<ImageRow path={path} text="A shot." source={{ fileName: "shot.png" }} />, {
    columns: 120,
    rows: 20
  })
  await file.tick()
  expect(file.lastFrame()).toContain("shot.png")
  file.unmount()
  await file.waitUntilExit()
})
