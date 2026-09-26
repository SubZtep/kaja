import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3"
import { Files } from "files-sdk"
import { hetzner } from "files-sdk/hetzner"
import { minio } from "files-sdk/minio"
import { env } from "./env"

const credentials = { accessKeyId: env.HCLOUD_ACCESS_KEY_ID, secretAccessKey: env.HCLOUD_SECRET_ACCESS_KEY }

/** Object storage for images: Hetzner Object Storage, or the S3-compatible server at `STORAGE_ENDPOINT` (RustFS in dev, tests, CI). */
export const files = new Files({
  adapter: env.STORAGE_ENDPOINT
    ? minio({ bucket: env.STORAGE_BUCKET, endpoint: env.STORAGE_ENDPOINT, ...credentials })
    : hetzner({ bucket: env.STORAGE_BUCKET, region: env.STORAGE_REGION, ...credentials })
})

/** Where a user's images live; a session's go under `<prefix>/<sessionId>`. */
export const userImagePrefix = (userId: string) => `images/${userId}`

/** Where a user's tool images go for the client to fetch by signed URL; a turn's session may not exist yet, so they sit apart and the bucket expires them after a day. */
export const toolImagePrefix = (userId: string) => `tool-images/${userId}`

/** Where one session's images live. */
export const sessionImagePrefix = (userId: string, sessionId: string) => `${userImagePrefix(userId)}/${sessionId}`

/** Dev, tests and CI only (a `STORAGE_ENDPOINT` server starts empty): creates the bucket if it isn't there. Hetzner's bucket is made once in its console. */
export async function ensureDevBucket(): Promise<void> {
  if (!env.STORAGE_ENDPOINT) return
  const client = new S3Client({
    endpoint: env.STORAGE_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
    credentials
  })
  try {
    await client.send(new HeadBucketCommand({ Bucket: env.STORAGE_BUCKET }))
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: env.STORAGE_BUCKET }))
  } finally {
    client.destroy()
  }
}
