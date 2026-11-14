import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import {
  createJobRunner,
  defineManifest,
  defineModule,
  type JobRunnerOptions,
  type Module,
  type ModuleJob,
  QUIET_DEFER_MINUTES,
  RETRY_MINUTES,
  scheduleJob
} from "@kaja/modules"
import { app } from "../../src/app"
import { sql } from "../../src/core/db"
import { quietUsers } from "../../src/features/nasi/module-jobs"
import { moduleService, statsService } from "../../src/services"
import { cleanupModel, seedModel, signUpAndSignIn } from "./helpers"

const tag = faker.string.alphanumeric(6).toLowerCase()
const emails = [`jobs-admin-${tag}@example.com`, `jobs-user-${tag}@example.com`, `jobs-gone-${tag}@example.com`]

let adminToken: string
let userToken: string
let userId: string
let goneId: string
let count = 0

/** A module of its own for one test, so no test sees another's rows. */
function moduleWith(...jobs: ModuleJob[]): Module {
  count += 1
  return defineModule(defineManifest({ id: `jobs-${tag}-${count}`, migrations: [] }), { tools: () => [], jobs })
}

/** A runner over `modules` with a clock the test moves; `reports` collects what it reported. */
function runnerFor(modules: Module[], opts: Partial<JobRunnerOptions> = {}) {
  const clock = { at: new Date() }
  const reports: string[] = []
  const runner = createJobRunner({
    sql,
    modules: async () => modules,
    userContext: async id => ({ sql, userId: id }),
    globalSend: async () => new Response("ok"),
    report: message => reports.push(message),
    now: () => clock.at,
    ...opts
  })
  const forward = (minutes: number) => {
    clock.at = new Date(clock.at.getTime() + minutes * 60_000)
  }
  return { runner, clock, reports, forward }
}

type Row = {
  due: number
  started: boolean
  attempts: number
  last_error: string | null
  user_id: string | null
}

/** A module's job rows; `due` is in minutes from `from`. */
async function rowsOf(module: Module, from: Date): Promise<Row[]> {
  const rows = await sql<
    { due_at: Date; started_at: Date | null; attempts: number; last_error: string | null; user_id: string | null }[]
  >`SELECT due_at, started_at, attempts, last_error, user_id FROM module_job WHERE module = ${module.id} ORDER BY job`
  return rows.map(row => ({
    due: Math.round((row.due_at.getTime() - from.getTime()) / 60_000),
    started: row.started_at !== null,
    attempts: row.attempts,
    last_error: row.last_error,
    user_id: row.user_id
  }))
}

beforeAll(async () => {
  adminToken = await signUpAndSignIn(emails[0]!, "Jobs Admin")
  userToken = await signUpAndSignIn(emails[1]!, "Jobs User")
  await signUpAndSignIn(emails[2]!, "Jobs Gone")
  await sql`UPDATE "user" SET role = 'admin' WHERE email = ${emails[0]!}`
  userId = (await sql<{ id: string }[]>`SELECT id FROM "user" WHERE email = ${emails[1]!}`)[0]!.id
  goneId = (await sql<{ id: string }[]>`SELECT id FROM "user" WHERE email = ${emails[2]!}`)[0]!.id
}, 30_000)

afterAll(async () => {
  await sql`DELETE FROM module_job WHERE module LIKE ${`jobs-${tag}-%`}`
  await sql`DELETE FROM "user" WHERE email IN ${sql(emails)}`
})

describe("module job runner", () => {
  test("a global job runs when its row is due, then waits its interval", async () => {
    let runs = 0
    const module = moduleWith({
      id: "collect",
      scope: "global",
      everyMinutes: 60,
      hosts: ["api.example"],
      run: async () => {
        runs += 1
        return undefined
      }
    })
    const { runner, clock, forward } = runnerFor([module])
    await runner.tick()
    expect(runs).toBe(1)
    expect(await rowsOf(module, clock.at)).toEqual([
      { due: 60, started: false, attempts: 0, last_error: null, user_id: null }
    ])
    forward(59)
    await runner.tick()
    expect(runs).toBe(1)
    forward(1)
    await runner.tick()
    expect(runs).toBe(2)
  })

  test("a global job reaches only the hosts it names, over https, without following redirects", async () => {
    const sent: { url: string; redirect?: string }[] = []
    const outcomes: string[] = []
    const module = moduleWith({
      id: "collect",
      scope: "global",
      everyMinutes: 60,
      hosts: ["api.example"],
      run: async ctx => {
        for (const url of ["https://api.example/list", "https://evil.example/", "http://api.example/list"])
          outcomes.push(
            await ctx.send(url).then(
              () => "sent",
              (error: Error) => error.message
            )
          )
        return undefined
      }
    })
    const { runner } = runnerFor([module], {
      globalSend: async (url, init) => {
        sent.push({ url: String(url), redirect: init?.redirect })
        return new Response("ok")
      }
    })
    await runner.tick()
    expect(sent).toEqual([{ url: "https://api.example/list", redirect: "error" }])
    const refusal = "This job may only reach api.example over https"
    expect(outcomes).toEqual(["sent", refusal, refusal])
  })

  test("a failed run is reported and retried after longer and longer waits, then at its regular time", async () => {
    const module = moduleWith({
      id: "broken",
      scope: "global",
      everyMinutes: 600,
      hosts: [],
      run: async () => {
        throw new Error("the list is down")
      }
    })
    const { runner, clock, reports, forward } = runnerFor([module])
    for (const [index, wait] of RETRY_MINUTES.entries()) {
      await runner.tick()
      expect(await rowsOf(module, clock.at)).toEqual([
        { due: wait, started: false, attempts: index + 1, last_error: "the list is down", user_id: null }
      ])
      forward(wait)
    }
    await runner.tick()
    expect(await rowsOf(module, clock.at)).toEqual([
      { due: 600, started: false, attempts: 0, last_error: "the list is down", user_id: null }
    ])
    expect(reports).toEqual(new Array(RETRY_MINUTES.length + 1).fill(`The ${module.id} module's broken job failed`))
    expect((await moduleService.list()).some(each => each.id === module.id)).toBeFalse()
  })

  test("a user's job starts when it is scheduled, sooner if asked again, and goes once it answers done", async () => {
    const seen: string[] = []
    const answer: { result: "done" | undefined } = { result: undefined }
    const module = moduleWith({
      id: "discover",
      scope: "user",
      everyMinutes: 1440,
      run: async ctx => {
        seen.push(ctx.userId)
        return answer.result
      }
    })
    const { runner, clock, forward } = runnerFor([module])
    await runner.tick()
    expect(seen).toEqual([])

    const ctx = { sql, userId }
    await scheduleJob(ctx, module.id, "discover", new Date(clock.at.getTime() + 60 * 60_000))
    await runner.tick()
    expect(seen).toEqual([])
    // An earlier time wins; a later one changes nothing.
    await scheduleJob(ctx, module.id, "discover", clock.at)
    await scheduleJob(ctx, module.id, "discover", new Date(clock.at.getTime() + 5 * 60_000))
    await runner.tick()
    expect(seen).toEqual([userId])
    expect(await rowsOf(module, clock.at)).toEqual([
      { due: 1440, started: false, attempts: 0, last_error: null, user_id: userId }
    ])

    answer.result = "done"
    forward(1440)
    await runner.tick()
    expect(seen).toEqual([userId, userId])
    expect(await rowsOf(module, clock.at)).toEqual([])
  })

  test("a job's model calls count towards the account's usage", async () => {
    const module = moduleWith({
      id: "discover",
      scope: "user",
      everyMinutes: 1440,
      run: async ctx => {
        ctx.onModelCall?.({ model: "matcher", promptTokens: 120, completionTokens: 30, latencyMs: 40 })
        return undefined
      }
    })
    const { runner, clock } = runnerFor([module])
    const before = await statsService.usage(userId, 1)
    await scheduleJob({ sql, userId }, module.id, "discover", clock.at)
    await runner.tick()
    const calls = await sql`
      SELECT job, model, prompt_tokens, completion_tokens FROM module_model_call WHERE module = ${module.id}`
    expect(calls).toEqual([{ job: "discover", model: "matcher", prompt_tokens: 120, completion_tokens: 30 }])
    const after = await statsService.usage(userId, 1)
    expect(after.totals.promptTokens - before.totals.promptTokens).toBe(120)
    expect(after.totals.completionTokens - before.totals.completionTokens).toBe(30)
    expect(after.models.find(each => each.model === "matcher")).toMatchObject({ summaries: 1, promptTokens: 120 })
  })

  test("a quiet account's due job waits instead of running", async () => {
    let runs = 0
    const module = moduleWith({
      id: "discover",
      scope: "user",
      everyMinutes: 1440,
      run: async () => {
        runs += 1
        return undefined
      }
    })
    let quiet = [userId]
    const { runner, clock, forward } = runnerFor([module], { quiet: async ids => ids.filter(id => quiet.includes(id)) })
    await scheduleJob({ sql, userId }, module.id, "discover", clock.at)
    await runner.tick()
    expect(runs).toBe(0)
    expect((await rowsOf(module, clock.at))[0]).toMatchObject({ due: QUIET_DEFER_MINUTES, attempts: 0 })
    quiet = []
    forward(QUIET_DEFER_MINUTES)
    await runner.tick()
    expect(runs).toBe(1)
  })

  test("an account is quiet until it has a recent conversation", async () => {
    expect(await quietUsers([userId, goneId])).toEqual([userId, goneId])
    await sql`
      INSERT INTO nasi_session (id, user_id, persona, model, title, channel)
      VALUES (${Bun.randomUUIDv7()}, ${userId}, 'default', 'm', 't', 'web')`
    expect(await quietUsers([userId, goneId])).toEqual([goneId])
    // The same conversation, looked at fifteen days later
    expect(await quietUsers([userId], new Date(Date.now() + 15 * 24 * 60 * 60_000))).toEqual([userId])
  })

  test("two runs at a time; a row a dead process left started is taken again later", async () => {
    let runs = 0
    const job = (id: string): ModuleJob => ({
      id,
      scope: "user",
      everyMinutes: 1440,
      run: async () => {
        runs += 1
        return undefined
      }
    })
    const module = moduleWith(job("a"), job("b"), job("c"))
    const { runner, clock, forward } = runnerFor([module], { timeoutMs: 60_000 })
    for (const id of ["a", "b", "c"]) await scheduleJob({ sql, userId }, module.id, id, clock.at)
    await sql`UPDATE module_job SET started_at = ${clock.at} WHERE module = ${module.id} AND job = 'c'`
    await runner.tick()
    expect(runs).toBe(2)
    await runner.tick()
    expect(runs).toBe(2)
    // Twice the run timeout later, whoever had the row is gone
    forward(3)
    await runner.tick()
    expect(runs).toBe(3)
  })

  test("a run that takes too long fails and frees its place", async () => {
    const module = moduleWith({
      id: "stuck",
      scope: "global",
      everyMinutes: 60,
      hosts: [],
      run: () => new Promise(() => {})
    })
    const { runner, clock } = runnerFor([module], { timeoutMs: 50 })
    await runner.tick()
    expect(await rowsOf(module, clock.at)).toEqual([
      { due: RETRY_MINUTES[0]!, started: false, attempts: 1, last_error: "The run took too long", user_id: null }
    ])
  })

  test("a module the host leaves out doesn't run, and a deleted account takes its rows along", async () => {
    let runs = 0
    const module = moduleWith({
      id: "discover",
      scope: "user",
      everyMinutes: 1440,
      run: async () => {
        runs += 1
        return undefined
      }
    })
    const { runner, clock } = runnerFor([])
    await scheduleJob({ sql, userId: goneId }, module.id, "discover", clock.at)
    await runner.tick()
    expect(runs).toBe(0)
    expect(await rowsOf(module, clock.at)).toHaveLength(1)
    await sql`DELETE FROM "user" WHERE id = ${goneId}`
    expect(await rowsOf(module, clock.at)).toEqual([])
  })
})

describe("/admin/modules", () => {
  const as = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" })
  const patch = (token: string, id: string, enabled: boolean) =>
    app.request(`/admin/modules/${id}`, { method: "PATCH", headers: as(token), body: JSON.stringify({ enabled }) })

  test("is for admins only", async () => {
    expect((await app.request("/admin/modules")).status).toBe(401)
    expect((await app.request("/admin/modules", { headers: as(userToken) })).status).toBe(403)
    expect((await patch(userToken, "reading", false)).status).toBe(403)
    expect((await patch(adminToken, "no-such-module", false)).status).toBe(404)
  })

  test("a module switched off has no tools for anyone until it is switched on again", async () => {
    const { providerId } = await seedModel("jobs")
    const tools = async () =>
      ((await (await app.request("/nasi/info", { headers: as(userToken) })).json()) as { tools: string[] }).tools
    const listed = async () => {
      const res = await app.request("/admin/modules", { headers: as(adminToken) })
      const { modules } = (await res.json()) as { modules: { id: string; enabled: boolean; jobs: { id: string }[] }[] }
      return modules.find(module => module.id === "reading")!
    }
    try {
      expect((await listed()).enabled).toBeTrue()
      expect(await tools()).toContain("save_article")

      expect((await patch(adminToken, "reading", false)).status).toBe(200)
      expect((await listed()).enabled).toBeFalse()
      expect(await tools()).not.toContain("save_article")
      expect((await moduleService.enabled()).map(module => module.id)).not.toContain("reading")

      expect((await patch(adminToken, "reading", true)).status).toBe(200)
      expect(await tools()).toContain("save_article")
    } finally {
      await sql`DELETE FROM module_state WHERE module = 'reading'`
      await cleanupModel(providerId)
    }
  })
})
