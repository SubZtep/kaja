import { scenario, t, widgetText } from "../src/scenario"
import { startSite } from "../src/site"
import { signUpOnWeb, visit } from "../src/web"

export default scenario(
  "Widget: create a key, embed it on a site, chat, get refused elsewhere, revoke",
  async ({ stack, page, newPage, newEmail, model, step }) => {
    const site = startSite()
    const elsewhere = startSite()
    try {
      step("sign up and create a widget key for the site's origin")
      await signUpOnWeb(page, stack, newEmail())
      await visit(page, `${stack.webUrl}/agent/widget`)
      await page.getByRole("textbox", { name: t("widget_field_label") }).fill("E2E site")
      await page.getByRole("textbox", { name: t("widget_field_allowed_origins") }).fill(site.origin)
      await page.getByRole("button", { name: t("widget_create_button") }).click()
      const rawKey = (
        await page.getByText(t("widget_embed_notice")).locator("xpath=following-sibling::p[1]").textContent()
      )?.trim()
      if (!rawKey) throw new Error("The page showed no widget key")

      step("embed it on the site and chat")
      const snippet = `<!doctype html><title>Embedded</title><h1>My site</h1><script async src="${stack.apiUrl}/widget/${rawKey}.js"></script>`
      site.setBody(snippet)
      const visitor = await newPage("site")
      await visitor.goto(site.url)
      await visitor.getByLabel(widgetText("openChat")).click()
      await model(async () => {
        await visitor
          .getByPlaceholder(widgetText("askPlaceholder"))
          .fill("Spell the number 4 in English, one lowercase word only.")
        await visitor.getByRole("button", { name: widgetText("send") }).click()
        await visitor.locator(".kaja-widget-msg-bot", { hasText: /\bfour\b/i }).waitFor({ timeout: 90_000 })
      })

      step("an origin the key does not list is refused")
      const turn = (origin: string) =>
        fetch(`${stack.apiUrl}/widget/turn`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-kaja-widget-key": rawKey, origin },
          body: JSON.stringify({ message: "hi", visitorId: "e2e-visitor" })
        })
      const refused = await turn(elsewhere.origin)
      if (refused.status !== 403) throw new Error(`A foreign origin got ${refused.status}, wanted 403`)

      step("revoke the key and the widget stops")
      await page.getByRole("button", { name: t("widget_revoke_confirm_button") }).click()
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: t("widget_revoke_confirm_button") })
        .click()
      await page.getByText(t("widget_status_revoked")).first().waitFor()
      const gone = await turn(site.origin)
      if (gone.status !== 401) throw new Error(`A revoked key got ${gone.status}, wanted 401`)
      const script = await fetch(`${stack.apiUrl}/widget/${rawKey}.js`)
      if (script.status !== 404) throw new Error(`A revoked key's script got ${script.status}, wanted 404`)
    } finally {
      await site.stop()
      await elsewhere.stop()
    }
  },
  { llm: true }
)
