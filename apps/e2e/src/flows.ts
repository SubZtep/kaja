import type { Page } from "playwright-core"
import { apiText, t } from "./scenario"
import type { Stack } from "./stack"

/** From the signed-in web dashboard: asks for the Telegram link, opens it in the chat window and confirms. The chat page ends up linked. */
export async function linkTelegram(stack: Stack, web: Page, chat: Page, email: string): Promise<void> {
  const { telegram } = stack
  await web.getByRole("button", { name: t("telegram_connect_button") }).click()
  const link = await web.getByRole("link", { name: /t\.me\// }).getAttribute("href")
  if (!link) throw new Error("The web page showed no Telegram link")

  await chat.goto(telegram.url)
  await telegram.openLink(chat, link)
  await telegram.waitForBot(email)
  await telegram.press(chat, apiText("telegram.linkConfirm"))
  await telegram.waitForBot("Send a message to start chatting")
}
