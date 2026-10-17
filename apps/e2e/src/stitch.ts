import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Browser } from "playwright-core"
import { e2eDir, e2eEnv } from "./env"
import type { Result } from "./runner"

const W = 1280
const H = 720
const FPS = 25
const CARD_SECONDS = 2.5

async function ffmpeg(args: string[]): Promise<void> {
  const child = Bun.spawn(["ffmpeg", "-y", "-v", "error", ...args], { stderr: "pipe", stdout: "ignore" })
  const [code, stderr] = [await child.exited, await new Response(child.stderr).text()]
  if (code !== 0) throw new Error(`ffmpeg ${args.join(" ")} failed (${code}): ${stderr.trim()}`)
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string)

/** A title card as an image: the scenario's name, and how it went. */
async function card(browser: Browser, file: string, title: string, subtitle: string, ok: boolean): Promise<void> {
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  try {
    await page.setContent(
      `<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0f0c;color:#eef2e6;font-family:system-ui,sans-serif;text-align:center">
        <div style="max-width:1000px;padding:0 40px"><div style="font-size:46px;font-weight:700;line-height:1.25">${escapeHtml(title)}</div>
        <div style="margin-top:28px;font-size:26px;color:${ok ? "#8ec478" : "#ff7a7a"}">${escapeHtml(subtitle)}</div></div></body>`
    )
    await page.screenshot({ path: file })
  } finally {
    await page.close()
  }
}

/** Where each of `count` clips goes on the grid, as xstack's layout string and the grid's size. */
function grid(count: number): { layout: string; cellW: number; cellH: number } {
  const columns = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / columns)
  const cellW = Math.floor(W / columns / 2) * 2
  const cellH = Math.floor(H / rows / 2) * 2
  const layout = Array.from(
    { length: count },
    (_, i) => `${(i % columns) * cellW}_${Math.floor(i / columns) * cellH}`
  ).join("|")
  return { layout, cellW, cellH }
}

/** The scenario's clips as one segment: the one clip, or all of them side by side (each from its own start, not time-aligned). */
async function segmentOf(clips: string[], out: string): Promise<void> {
  const encode = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(FPS), "-preset", "veryfast", "-crf", "23"]
  if (clips.length === 1) {
    await ffmpeg([
      "-i",
      clips[0]!,
      "-vf",
      `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`,
      ...encode,
      out
    ])
    return
  }
  const { layout, cellW, cellH } = grid(clips.length)
  const scaled = clips.map(
    (_, i) =>
      `[${i}:v]scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease,pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:black[v${i}]`
  )
  const inputs = clips.map((_, i) => `[v${i}]`).join("")
  const filter = `${scaled.join(";")};${inputs}xstack=inputs=${clips.length}:layout=${layout}:fill=black,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`
  await ffmpeg([...clips.flatMap(clip => ["-i", clip]), "-filter_complex", filter, ...encode, out])
}

/** One video of the whole run: a title card per scenario, then its clips (side by side when it recorded several). Returns its path. */
export async function stitch(browser: Browser, results: Result[]): Promise<string> {
  const outDir = join(e2eDir, e2eEnv.E2E_OUT_DIR)
  const work = join(outDir, "segments")
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })

  const parts: string[] = []
  let index = 0
  for (const result of results) {
    if (result.videos.length === 0) continue
    const base = join(work, String(++index).padStart(2, "0"))
    const png = `${base}-card.png`
    const subtitle = result.ok
      ? `passed in ${result.seconds.toFixed(0)} s`
      : `FAILED (${result.kind}): ${result.error?.split("\n")[0]?.slice(0, 110) ?? ""}`
    await card(browser, png, result.name, subtitle, result.ok)
    await ffmpeg([
      "-loop",
      "1",
      "-t",
      String(CARD_SECONDS),
      "-i",
      png,
      "-vf",
      `format=yuv420p,scale=${W}:${H}`,
      "-r",
      String(FPS),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      `${base}-card.mp4`
    ])
    parts.push(`${base}-card.mp4`)
    // Two pages ran together (web and a companion): side by side. More were launched one after another: in turn.
    const groups = result.videos.length <= 2 ? [result.videos] : result.videos.map(clip => [clip])
    for (const [n, group] of groups.entries()) {
      const segment = `${base}-clips-${n}.mp4`
      await segmentOf(group, segment)
      parts.push(segment)
    }
  }
  if (parts.length === 0) throw new Error("No clips to stitch")

  const list = join(work, "list.txt")
  writeFileSync(list, parts.map(part => `file '${part}'`).join("\n"))
  const output = join(outDir, "full-run.mp4")
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", output])
  return output
}
