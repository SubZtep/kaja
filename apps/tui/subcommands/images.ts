import type { KajaMode } from "../lib/config/mode"
import { t } from "../lib/i18n"

type ImagesArgs = { input: string[]; flags: { retry?: boolean; yes?: boolean } }

/**
 * `kaja images [describe [--retry] | clean [--yes]]`: the stored images' numbers (the local store's, or in cloud mode
 * the account's), and locally describing the ones without a description or removing what nothing needs.
 */
export async function runImagesSubcommand(args: ImagesArgs, mode: KajaMode) {
  const action = args.input[1]
  if (action !== undefined && action !== "describe" && action !== "clean") {
    console.log(t("images.unknownAction", { action }))
    process.exit(1)
  }
  if (mode === "cloud") {
    if (action) {
      console.log(t("images.localOnly"))
      process.exit(1)
    }
    await printCloudImages()
    process.exit(0)
  }

  const { resolveMemoryDbPath } = await import("../lib/memory/store")
  const { imagesRoot, openLocalDb } = await import("../lib/store/sqlite")
  const dbPath = await resolveMemoryDbPath()
  const db = await openLocalDb(dbPath)
  try {
    if (action === "describe") await describeMissing(db, imagesRoot(dbPath), args.flags.retry === true)
    else if (action === "clean") await clean(db, imagesRoot(dbPath), args.flags.yes === true)
    else {
      const { localImageStats } = await import("../lib/store/image-maintenance")
      const { formatImageReport } = await import("../lib/image/report")
      console.log(formatImageReport(await localImageStats(db)))
    }
  } finally {
    await db.close()
  }
  process.exit(0)
}

// The signed-in account's images, as its stats page shows them (the last 30 days' additions)
async function printCloudImages() {
  const { loadToken } = await import("../lib/auth/credentials")
  const { getApiBaseUrl } = await import("../lib/config/api-url")
  const { usageStatsResponseSchema } = await import("@kaja/schema/api")
  const { formatImageReport } = await import("../lib/image/report")
  const token = await loadToken()
  if (!token) {
    console.log(t("images.signInFirst"))
    process.exit(1)
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const days = 30
  const res = await fetch(`${getApiBaseUrl()}/stats?days=${days}&tz=${encodeURIComponent(tz)}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    console.log(t("images.cloudFailed", { status: res.status }))
    process.exit(1)
  }
  const { images } = usageStatsResponseSchema.parse(await res.json())
  console.log(
    formatImageReport({
      ...images,
      added: { days, count: images.added, bytes: images.addedBytes },
      sessions: images.sessions.map(({ id, title, images: count, bytes }) => ({ id, title, images: count, bytes }))
    })
  )
}

async function describeMissing(db: import("bun").SQL, filesRoot: string, retry: boolean) {
  const { describer } = await import("../lib/models/openai")
  if (!describer) {
    console.log(t("images.noVision"))
    process.exit(1)
  }
  const { DESCRIBE_CONCURRENCY, describeLocalImage, imagesToDescribe } = await import("../lib/store/image-maintenance")
  const queue = await imagesToDescribe(db, retry)
  if (queue.length === 0) {
    console.log(t("images.nothingToDescribe"))
    return
  }
  console.log(t("images.describing", { count: queue.length, model: describer.model }))
  let described = 0
  let next = 0
  const worker = async () => {
    while (next < queue.length) {
      const image = queue[next++]!
      try {
        const text = await describeLocalImage(db, filesRoot, describer, image)
        if (text) described++
        console.log(text ? `✓ ${image.id}  ${text}` : `✗ ${image.id}  ${t("images.noDescription")}`)
      } catch (error) {
        console.log(`✗ ${image.id}  ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(DESCRIBE_CONCURRENCY, queue.length) }, worker))
  console.log(t("images.described", { described, total: queue.length }))
}

async function clean(db: import("bun").SQL, filesRoot: string, yes: boolean) {
  const { findOrphans, removeOrphans } = await import("../lib/store/image-maintenance")
  const { formatBytes } = await import("../lib/image/report")
  const found = await findOrphans(db, filesRoot)
  const kinds = (["files", "rows", "unsaved"] as const).filter(kind => found[kind].count > 0)
  if (kinds.length === 0) {
    console.log(t("images.nothingToClean"))
    return
  }
  // Asking needs someone to answer: a script gets the report, and --yes to act on it
  const interactive = process.stdin.isTTY
  for (const kind of kinds) {
    const { count, bytes, examples } = found[kind]
    console.log(t(`images.orphans.${kind}`, { count, size: formatBytes(bytes) }))
    for (const example of examples) console.log(`  ${example}`)
    const remove = yes || (interactive && /^y(es)?$/i.test(prompt(t("images.removeAsk"))?.trim() ?? ""))
    if (!remove) continue
    console.log(t("images.removed", { count: await removeOrphans(db, kind, found) }))
  }
  if (!yes && !interactive) console.log(t("images.removeHint"))
}
