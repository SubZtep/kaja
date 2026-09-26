import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client
} from "@aws-sdk/client-s3"
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

/** Days a leftover tool image lives under `tool-images/` before the bucket's lifecycle rule deletes it. */
const TOOL_IMAGE_DAYS = 1

/**
 * Readies the bucket on boot: creates it on a dev server (`STORAGE_ENDPOINT` starts empty; Hetzner's is made once in its console),
 * then sets the rule that expires `tool-images/`. Hetzner only takes lifecycle rules through the S3 API, so the API sets it itself.
 */
export async function prepareBucket(): Promise<void> {
  const client = new S3Client({
    endpoint: env.STORAGE_ENDPOINT ?? `https://${env.STORAGE_REGION}.your-objectstorage.com`,
    region: env.STORAGE_ENDPOINT ? "us-east-1" : env.STORAGE_REGION,
    forcePathStyle: !!env.STORAGE_ENDPOINT,
    credentials
  })
  const Bucket = env.STORAGE_BUCKET
  try {
    if (env.STORAGE_ENDPOINT) {
      await client.send(new HeadBucketCommand({ Bucket })).catch(() => client.send(new CreateBucketCommand({ Bucket })))
    }
    await client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: "expire-tool-images",
              Status: "Enabled",
              Filter: { Prefix: "tool-images/" },
              Expiration: { Days: TOOL_IMAGE_DAYS }
            }
          ]
        }
      })
    )
  } finally {
    client.destroy()
  }
}
