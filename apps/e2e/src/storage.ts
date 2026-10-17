import { apiEnv, e2eEnv } from "./env"

/** The keys in the stack's images bucket under `prefix`. */
export async function listObjects(prefix: string): Promise<string[]> {
  const client = new Bun.S3Client({
    bucket: e2eEnv.E2E_STORAGE_BUCKET,
    endpoint: apiEnv.STORAGE_ENDPOINT,
    accessKeyId: apiEnv.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: apiEnv.STORAGE_SECRET_ACCESS_KEY,
    region: apiEnv.STORAGE_REGION ?? "auto"
  })
  const result = await client.list({ prefix })
  return (result.contents ?? []).map(object => object.key)
}
