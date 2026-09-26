import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3"
import { Files } from "files-sdk"
import { hetzner } from "files-sdk/hetzner"
import { minio } from "files-sdk/minio"
import { env } from "./env"

const credentials = { accessKeyId: env.STORAGE_ACCESS_KEY_ID, secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY }

/** Object storage for images: Hetzner Object Storage, or the S3-compatible server at `STORAGE_ENDPOINT` (RustFS in dev, tests, CI). */
export const files = storage(env.STORAGE_ENDPOINT)

// Signing is offline, so URLs for clients are signed against the host they reach the server by (the compose API reaches storage:9000, the browser localhost:9000).
const signer = env.STORAGE_PUBLIC_ENDPOINT ? storage(env.STORAGE_PUBLIC_ENDPOINT) : files

function storage(endpoint: string | undefined) {
  return new Files({
    adapter: endpoint
      ? minio({ bucket: env.STORAGE_BUCKET, endpoint, ...credentials })
      : hetzner({ bucket: env.STORAGE_BUCKET, region: env.STORAGE_REGION, ...credentials })
  })
}

/** A time-limited URL a client can fetch the object from. */
export const signedUrl = (key: string, expiresIn: number) => signer.url(key, { expiresIn })

/** Where a user's tool images go when their turn's session doesn't exist yet (a new one is saved at the turn's end); the bucket expires them after a day. */
export const toolImagePrefix = (userId: string) => `tool-images/${userId}`

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
