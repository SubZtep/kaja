import { CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, S3Client } from "@aws-sdk/client-s3"
import type { ObjectStore } from "@kaja/nasi"
import { env } from "./env"

const credentials = { accessKeyId: env.STORAGE_ACCESS_KEY_ID, secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY }
const endpoint = env.STORAGE_ENDPOINT ?? `https://${env.STORAGE_REGION}.your-objectstorage.com`
const region = env.STORAGE_ENDPOINT ? "us-east-1" : env.STORAGE_REGION

/** The images bucket: Hetzner Object Storage, or the S3-compatible server at `STORAGE_ENDPOINT` (RustFS in dev, tests, CI). */
const bucket = new Bun.S3Client({ bucket: env.STORAGE_BUCKET, endpoint, region, ...credentials })

/** What anyone may read: the images, never a listing (see {@link prepareBucket}). */
const PUBLIC_PREFIX = "images/"

/** The endpoint without its trailing slashes, so the key path below adds exactly one (a regex would backtrack on a run of them). */
function withoutTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value[end - 1] === "/") end -= 1
  return value.slice(0, end)
}

/**
 * An object's public URL, which needs no signing: `images/` is public-read. Path-style on a server of our own
 * (`STORAGE_PUBLIC_ENDPOINT` as clients reach it, else `STORAGE_ENDPOINT`), Hetzner's virtual-hosted form otherwise.
 */
export function imageUrl(key: string): string {
  const path = key.split("/").map(encodeURIComponent).join("/")
  const base = env.STORAGE_PUBLIC_ENDPOINT ?? env.STORAGE_ENDPOINT
  if (base) return `${withoutTrailingSlashes(base)}/${env.STORAGE_BUCKET}/${path}`
  return `https://${env.STORAGE_BUCKET}.${env.STORAGE_REGION}.your-objectstorage.com/${path}`
}

const isMissing = (error: unknown) => (error as { code?: string })?.code === "NoSuchKey"

/** The bucket as nasi's object store: session images and their descriptions. */
export const objects: ObjectStore = {
  put: async (key, data, type) => {
    await bucket.write(key, data, type ? { type } : undefined)
  },
  get: async key => {
    try {
      return new Uint8Array(await bucket.file(key).arrayBuffer())
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  },
  exists: key => bucket.exists(key),
  deletePrefix: async prefix => {
    // A page at a time; deleting them doesn't move the listing, since each page starts after the last.
    let startAfter: string | undefined
    while (true) {
      const page = await bucket.list({ prefix, ...(startAfter ? { startAfter } : {}) })
      const keys = (page.contents ?? []).map(object => object.key)
      await Promise.all(keys.map(key => bucket.delete(key)))
      if (!page.isTruncated || keys.length === 0) return
      startAfter = keys.at(-1)
    }
  },
  location: imageUrl
}

/**
 * Readies the bucket on boot: creates it on a dev server (`STORAGE_ENDPOINT` starts empty; Hetzner's is made once in
 * its console), then lets anyone read `images/` (never list it), so clients and Telegram fetch images by plain URL.
 * Hetzner only takes bucket policies through the S3 API, so the API sets it itself.
 */
export async function prepareBucket(): Promise<void> {
  const client = s3Client()
  const Bucket = env.STORAGE_BUCKET
  try {
    if (env.STORAGE_ENDPOINT) {
      await client.send(new HeadBucketCommand({ Bucket })).catch(() => client.send(new CreateBucketCommand({ Bucket })))
    }
    const statement = {
      Effect: "Allow",
      Principal: "*",
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${Bucket}/${PUBLIC_PREFIX}*`]
    }
    const Policy = JSON.stringify({ Version: "2012-10-17", Statement: [statement] })
    await client.send(new PutBucketPolicyCommand({ Bucket, Policy }))
  } finally {
    client.destroy()
  }
}

// The AWS client for what Bun's S3 client doesn't do: creating the bucket and setting its policy.
function s3Client() {
  return new S3Client({ endpoint, region, forcePathStyle: !!env.STORAGE_ENDPOINT, credentials })
}

/** Whether the bucket answers within `timeoutMs`, for `/health/ready`. */
export async function storageReachable(timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>(resolve => {
    timer = setTimeout(() => resolve(false), timeoutMs)
  })
  const answered = bucket.list({ maxKeys: 1 }).then(
    () => true,
    () => false
  )
  try {
    return await Promise.race([answered, timeout])
  } finally {
    clearTimeout(timer)
  }
}
