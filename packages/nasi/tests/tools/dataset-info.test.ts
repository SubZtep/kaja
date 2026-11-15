import { afterEach, expect, setSystemTime, test } from "bun:test"
import type { Dataset } from "@kaja/schema/cli"
import { LOCAL_OWNER_CTX } from "../../src/agent/tools"
import { setDatasetLoaders } from "../../src/personas"
import { createMemoryStore, type NasiStore } from "../../src/store"
import { datasetInfoTool } from "../../src/tools/builtin/dataset-info"

let store: NasiStore = createMemoryStore()
function ctx(owner?: string | null) {
  return { ...LOCAL_OWNER_CTX, store, owner: owner ?? LOCAL_OWNER_CTX.owner }
}

const datasets = new Map<string, Dataset>([
  [
    "onboarding",
    {
      label: "Onboarding",
      revalidateAfterDays: 30,
      fields: [
        { name: "favorite_color", prompt: "What's your favorite color?" },
        {
          name: "notification_pref",
          prompt: "How do you want to be notified?",
          accepted: ["email", "push", "none"]
        }
      ]
    }
  ],
  [
    "never_expires",
    {
      label: "Never Expires",
      fields: [{ name: "name", prompt: "What's your name?" }]
    }
  ]
])

setDatasetLoaders({
  loadDatasets: async () => datasets,
  loadDataset: async topic => datasets.get(topic)
})

afterEach(() => {
  store = createMemoryStore()
})

test("list_datasets lists available datasets with field counts", async () => {
  const result = await datasetInfoTool.execute({ action: "list_datasets" }, ctx())
  expect(result).toContain("onboarding: Onboarding (2 fields)")
  expect(result).toContain("never_expires: Never Expires (1 fields)")
})

test("get_status on an unknown dataset returns an error", async () => {
  const result = await datasetInfoTool.execute(
    {
      action: "get_status",
      dataset: "nope"
    },
    ctx()
  )
  expect(result).toBe("Unknown dataset: nope")
})

test("get_status on a fresh dataset lists all fields unanswered", async () => {
  const result = await datasetInfoTool.execute(
    {
      action: "get_status",
      dataset: "onboarding"
    },
    ctx()
  )
  expect(result).toContain("Version 1.")
  expect(result).toContain("favorite_color")
  expect(result).toContain("notification_pref")
  expect(result).toContain("accepted answers: email, none, push")
  expect(result).not.toContain("Already answered")
})

test("answer rejects a value not in the field's accepted list, without persisting", async () => {
  const owner = "test:reject"
  const result = await datasetInfoTool.execute(
    {
      action: "answer",
      dataset: "onboarding",
      field: "notification_pref",
      value: "carrier pigeon"
    },
    ctx(owner)
  )
  expect(result).toContain("isn't an accepted answer")
  expect(result).toContain("email, none, push")

  const status = await datasetInfoTool.execute({ action: "get_status", dataset: "onboarding" }, ctx(owner))
  expect(status).not.toContain("Already answered")
})

test("answer accepts a case-insensitive match against the accepted list", async () => {
  const result = await datasetInfoTool.execute(
    {
      action: "answer",
      dataset: "onboarding",
      field: "notification_pref",
      value: "EMAIL"
    },
    ctx("test:case-insensitive")
  )
  expect(result).toContain("Already answered")
  expect(result).toContain("notification_pref: EMAIL")
})

test("answer on an unknown field returns an error", async () => {
  const result = await datasetInfoTool.execute(
    { action: "answer", dataset: "onboarding", field: "nope", value: "x" },
    ctx("test:unknown-field")
  )
  expect(result).toBe("Unknown field: nope")
})

test("answering every field marks the version complete", async () => {
  const owner = "test:complete"
  await datasetInfoTool.execute(
    {
      action: "answer",
      dataset: "never_expires",
      field: "name",
      value: "Andras"
    },
    ctx(owner)
  )
  const status = await datasetInfoTool.execute({ action: "get_status", dataset: "never_expires" }, ctx(owner))
  expect(status).toContain("complete, never expires")
})

test("a complete, non-stale version is resumed as complete rather than restarted", async () => {
  const owner = "test:resume-complete"
  await datasetInfoTool.execute(
    {
      action: "answer",
      dataset: "never_expires",
      field: "name",
      value: "Andras"
    },
    ctx(owner)
  )
  const status = await datasetInfoTool.execute({ action: "get_status", dataset: "never_expires" }, ctx(owner))
  expect(status).toContain("Version 1.")
  expect(status).toContain("complete, never expires")
  expect(status).not.toContain("started fresh version")
})

test("start_new_version opens the next version without waiting for staleness", async () => {
  const owner = "test:new-version"
  await datasetInfoTool.execute(
    {
      action: "answer",
      dataset: "never_expires",
      field: "name",
      value: "Andras"
    },
    ctx(owner)
  )
  const result = await datasetInfoTool.execute({ action: "start_new_version", dataset: "never_expires" }, ctx(owner))
  expect(result).toContain("started fresh version 2")
  expect(result).toContain("version 1 keeps the previous answers")
  const status = await datasetInfoTool.execute({ action: "get_status", dataset: "never_expires" }, ctx(owner))
  expect(status).toContain("Version 2.")
  expect(status).toContain("Still need")
  expect(status).not.toContain("Already answered")
})

test("from the second version on, the status lists the answers of the version before", async () => {
  const owner = "test:compare"
  const today = new Date().toISOString().slice(0, 10)
  const first = await datasetInfoTool.execute(
    { action: "answer", dataset: "never_expires", field: "name", value: "Andras" },
    ctx(owner)
  )
  expect(first).not.toContain("to compare with")
  expect(await datasetInfoTool.execute({ action: "get_status", dataset: "never_expires" }, ctx(owner))).not.toContain(
    "to compare with"
  )

  const previous = `Version 1 (answered ${today}), to compare with:\n- name: Andras`
  expect(
    await datasetInfoTool.execute({ action: "start_new_version", dataset: "never_expires" }, ctx(owner))
  ).toEndWith(previous)
  await datasetInfoTool.execute(
    { action: "answer", dataset: "never_expires", field: "name", value: "Andy" },
    ctx(owner)
  )
  const status = await datasetInfoTool.execute({ action: "get_status", dataset: "never_expires" }, ctx(owner))
  expect(status).toStartWith("Version 2.\nAlready answered:\n- name: Andy")
  expect(status).toEndWith(previous)
})

test("a complete version past its revalidation days gives way to a fresh one, with the old answers to compare", async () => {
  const owner = "test:stale"
  const answeredOn = new Date().toISOString().slice(0, 10)
  for (const [field, value] of [
    ["favorite_color", "green"],
    ["notification_pref", "email"]
  ] as const) {
    await datasetInfoTool.execute({ action: "answer", dataset: "onboarding", field, value }, ctx(owner))
  }
  setSystemTime(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000))
  try {
    const status = await datasetInfoTool.execute({ action: "get_status", dataset: "onboarding" }, ctx(owner))
    expect(status).toContain("started fresh version 2")
    expect(status).not.toContain("Already answered")
    expect(status).toEndWith(
      `Version 1 (answered ${answeredOn}), to compare with:\n- favorite_color: green\n- notification_pref: email`
    )
  } finally {
    setSystemTime()
  }
})

test("answers after start_new_version land in the new version and leave the old one as it was", async () => {
  const owner = "test:new-version-answers"
  const answer = (value: string) =>
    datasetInfoTool.execute({ action: "answer", dataset: "never_expires", field: "name", value }, ctx(owner))
  await answer("Andras")
  await datasetInfoTool.execute({ action: "start_new_version", dataset: "never_expires" }, ctx(owner))
  const opened = await store.loadDatasetVersionCompletedAt("never_expires", owner, 2)
  await Bun.sleep(5)
  const result = await answer("Andy")
  expect(result).toContain("Version 2.")
  expect((await store.loadDatasetAnswers("never_expires", owner, 1)).map(a => a.value)).toEqual(["Andras"])
  expect((await store.loadDatasetAnswers("never_expires", owner, 2)).map(a => a.value)).toEqual(["Andy"])
  // The new version's time moves from when it was opened to when it was completed
  const completed = await store.loadDatasetVersionCompletedAt("never_expires", owner, 2)
  expect(completed! > opened!).toBe(true)
})

test("start_new_version doesn't open a version while the current one has no answers", async () => {
  const owner = "test:new-version-empty"
  const start = () => datasetInfoTool.execute({ action: "start_new_version", dataset: "never_expires" }, ctx(owner))
  expect(await start()).toContain("Version 1.")
  expect(await store.latestDatasetVersion("never_expires", owner)).toBe(0)

  await datasetInfoTool.execute(
    { action: "answer", dataset: "never_expires", field: "name", value: "Andras" },
    ctx(owner)
  )
  expect(await start()).toContain("started fresh version 2")
  // Asked twice in a row: still version 2
  expect(await start()).toContain("Version 2.")
  expect(await store.latestDatasetVersion("never_expires", owner)).toBe(2)
})

test("changing an answer of a complete version keeps its completion time", async () => {
  const owner = "test:complete-once"
  const answer = (value: string) =>
    datasetInfoTool.execute({ action: "answer", dataset: "never_expires", field: "name", value }, ctx(owner))
  await answer("Andras")
  const completed = await store.loadDatasetVersionCompletedAt("never_expires", owner, 1)
  await Bun.sleep(5)
  await answer("Andy")
  expect(await store.loadDatasetVersionCompletedAt("never_expires", owner, 1)).toBe(completed!)
  expect((await store.loadDatasetAnswers("never_expires", owner, 1)).map(a => a.value)).toEqual(["Andy"])
})

test("owner scoping: two owners answering the same dataset don't see each other's progress", async () => {
  await datasetInfoTool.execute(
    {
      action: "answer",
      dataset: "onboarding",
      field: "favorite_color",
      value: "blue"
    },
    ctx("telegram:1")
  )
  const statusForOwner1 = await datasetInfoTool.execute(
    { action: "get_status", dataset: "onboarding" },
    ctx("telegram:1")
  )
  const statusForOwner2 = await datasetInfoTool.execute(
    { action: "get_status", dataset: "onboarding" },
    ctx("telegram:2")
  )
  expect(statusForOwner1).toContain("favorite_color: blue")
  expect(statusForOwner2).not.toContain("Already answered")
})
