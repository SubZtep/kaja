import { signUp } from "../src/api"
import { queryDb } from "../src/db"
import { scenario, t } from "../src/scenario"
import { pollUntil } from "../src/wait"
import { signUpOnWeb, visit } from "../src/web"

export default scenario(
  "Web: the admin area is for admins, and disabling the model stops the agent",
  async ({ stack, page, newEmail, model, step }) => {
    const adminEmail = newEmail()
    const member = await signUp(stack, newEmail())

    step("a plain user is sent away from /admin")
    await signUpOnWeb(page, stack, adminEmail)
    await visit(page, `${stack.webUrl}/admin/users`)
    if (!new URL(page.url()).pathname.startsWith("/dashboard")) throw new Error(`A user reached ${page.url()}`)

    step("promoted, the users page lists everyone")
    await queryDb(stack, `UPDATE "user" SET role = 'admin' WHERE email = $1`, [adminEmail])
    await visit(page, `${stack.webUrl}/admin/users`)
    await page.getByText(adminEmail).first().waitFor()
    await page.getByText(member.email).first().waitFor()

    step("a user's detail page")
    const row = page.getByRole("row").filter({ hasText: member.email })
    await row.getByLabel(t("users_view_details")).click()
    await page.getByText(member.email).first().waitFor()
    if (!page.url().includes("/admin/users/")) throw new Error("The detail link went elsewhere")

    // The saved state is the proof; the success toast comes and goes
    const waitForEnabled = async (wanted: boolean) => {
      const row = await pollUntil(
        async () =>
          (await queryDb<{ enabled: boolean }>(stack, `SELECT enabled FROM model WHERE 'chat' = ANY(tasks)`))[0],
        found => found?.enabled === wanted,
        { timeoutMs: 15_000, intervalMs: 300 }
      )
      if (row?.enabled !== wanted) throw new Error(`The chat model never became enabled=${wanted}`)
    }

    step("disable the model on the models page")
    const [chat] = await queryDb<{ model: string }>(stack, `SELECT model FROM model WHERE 'chat' = ANY(tasks)`)
    if (!chat) throw new Error("No chat model in the database")
    await visit(page, `${stack.webUrl}/admin/models`)
    const enabled = page.getByRole("checkbox", { name: t("models_toggle_enabled", { model: chat.model }) })
    await enabled.click()
    await waitForEnabled(false)

    step("a turn now finds no model (503)")
    const refused = await member.call("POST", "/nasi/turn", { message: "hello" })
    if (refused.status !== 503) throw new Error(`Turn with no model answered ${refused.status}, wanted 503`)

    step("enable it again and the agent answers")
    await enabled.click()
    await waitForEnabled(true)
    await model(async () => {
      const turn = await member.turn({ message: "Reply with only the word: ready" })
      if (!/ready/i.test(turn.message)) throw new Error(`Unexpected reply: ${turn.message}`)
    })
  },
  { llm: true }
)
