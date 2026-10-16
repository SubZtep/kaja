import { expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TerminalImage } from "../../../components/elem/terminal-image"
import { drawnTerminalImage, renderTerminalImage } from "../../../lib/image/render-terminal-image"
import { png } from "../../fixtures/images"
import { renderForTest } from "../../test-utils"

const path = join(tmpdir(), `kaja-terminal-image-${Bun.randomUUIDv7()}.png`)
await Bun.write(path, await png(400, 200))

const size = { width: 72, height: 24 }

test("a row mounted again paints the picture at once, at the height it had", async () => {
  const first = renderForTest(<TerminalImage href={path} alt="a picture" />, { columns: 120, rows: 30 })
  await first.tick()
  // The half-block drawing, not the alt text standing in for it while loading
  expect(first.lastFrame()).toContain("▄")
  first.unmount()
  await first.waitUntilExit()

  // The chat's scroll view unmounts a row that scrolls out of its window and mounts it again when it scrolls back.
  // A picture kept only in the row's own state would come back blank, leaving the row measuring its alt text again.
  const second = renderForTest(<TerminalImage href={path} alt="a picture" />, { columns: 120, rows: 30 })
  expect(second.lastFrame()).toContain("▄")
  second.unmount()
  await second.waitUntilExit()
})

test("the same picture at the same size is drawn once, whoever asks", async () => {
  expect(await renderTerminalImage(path, size)).toBe(await renderTerminalImage(path, size))
  expect(drawnTerminalImage(path, size)).toBeDefined()
  // Another size is another drawing
  expect(drawnTerminalImage(path, { width: 40, height: 12 })).toBeUndefined()
})

test("a local file rewritten under its path is drawn again", async () => {
  await renderTerminalImage(path, size)
  await Bun.write(path, await png(800, 400))
  // A tool may write another picture to the same path, so what the file was is part of what is keyed on it
  expect(drawnTerminalImage(path, size)).toBeUndefined()
})
