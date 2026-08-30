import { getDb } from "./db"

export type DatasetAnswer = {
  field: string
  value: string
  answeredAt: string
}

function ownerKey(owner: string | null): string {
  return owner ?? ""
}
function ownerOf(key: string): string | null {
  return key === "" ? null : key
}

export async function latestDatasetVersion(topic: string, owner: string | null): Promise<number> {
  const database = getDb()
  const row = database
    .query(
      `SELECT MAX(version) AS version FROM (
         SELECT version FROM dataset_answers WHERE topic = $topic AND owner = $owner
         UNION ALL
         SELECT version FROM dataset_versions WHERE topic = $topic AND owner = $owner
       )`
    )
    .get({ $topic: topic, $owner: ownerKey(owner) }) as {
    version: number | null
  } | null
  return row?.version ?? 0
}

export async function loadDatasetAnswers(
  topic: string,
  owner: string | null,
  version: number
): Promise<DatasetAnswer[]> {
  const database = getDb()
  return database
    .query(
      `SELECT field, value, answeredAt FROM dataset_answers
       WHERE topic = $topic AND owner = $owner AND version = $version
       ORDER BY answeredAt ASC`
    )
    .all({
      $topic: topic,
      $owner: ownerKey(owner),
      $version: version
    }) as DatasetAnswer[]
}

export async function saveDatasetAnswer(
  topic: string,
  owner: string | null,
  version: number,
  field: string,
  value: string
): Promise<void> {
  const database = getDb()
  database
    .query(
      `INSERT INTO dataset_answers (topic, owner, version, field, value, answeredAt)
       VALUES ($topic, $owner, $version, $field, $value, $answeredAt)
       ON CONFLICT(topic, owner, version, field) DO UPDATE SET value = excluded.value, answeredAt = excluded.answeredAt`
    )
    .run({
      $topic: topic,
      $owner: ownerKey(owner),
      $version: version,
      $field: field,
      $value: value,
      $answeredAt: new Date().toISOString()
    })
}

export async function markDatasetVersionComplete(topic: string, owner: string | null, version: number): Promise<void> {
  const database = getDb()
  database
    .query(
      `INSERT OR IGNORE INTO dataset_versions (topic, owner, version, completedAt)
       VALUES ($topic, $owner, $version, $completedAt)`
    )
    .run({
      $topic: topic,
      $owner: ownerKey(owner),
      $version: version,
      $completedAt: new Date().toISOString()
    })
}

export async function loadDatasetVersionCompletedAt(
  topic: string,
  owner: string | null,
  version: number
): Promise<string | undefined> {
  const database = getDb()
  const row = database
    .query("SELECT completedAt FROM dataset_versions WHERE topic = $topic AND owner = $owner AND version = $version")
    .get({
      $topic: topic,
      $owner: ownerKey(owner),
      $version: version
    }) as { completedAt: string } | null
  return row?.completedAt
}

export async function listDatasetVersionsSummary(): Promise<
  {
    topic: string
    owner: string | null
    version: number
    answeredCount: number
    completedAt: string | undefined
  }[]
> {
  const database = getDb()
  const rows = database
    .query(
      `SELECT a.topic AS topic, a.owner AS owner, a.version AS version,
              COUNT(*) AS answeredCount, v.completedAt AS completedAt
       FROM dataset_answers a
       LEFT JOIN dataset_versions v
         ON v.topic = a.topic AND v.owner = a.owner AND v.version = a.version
       GROUP BY a.topic, a.owner, a.version
       ORDER BY a.topic ASC, a.owner ASC, a.version ASC`
    )
    .all() as {
    topic: string
    owner: string
    version: number
    answeredCount: number
    completedAt: string | null
  }[]
  return rows.map(row => ({
    ...row,
    owner: ownerOf(row.owner),
    completedAt: row.completedAt ?? undefined
  }))
}

export async function listAllDatasetAnswers(): Promise<
  (DatasetAnswer & { topic: string; owner: string | null; version: number })[]
> {
  const database = getDb()
  const rows = database
    .query(
      `SELECT topic, owner, version, field, value, answeredAt FROM dataset_answers
       ORDER BY topic ASC, owner ASC, version ASC, answeredAt ASC`
    )
    .all() as (DatasetAnswer & {
    topic: string
    owner: string
    version: number
  })[]
  return rows.map(row => ({ ...row, owner: ownerOf(row.owner) }))
}
