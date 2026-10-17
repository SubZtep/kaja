import { queryDb } from "../src/db"
import { linkTelegram } from "../src/flows"
import { writeRedBluePng } from "../src/images"
import { scenario } from "../src/scenario"
import { listObjects } from "../src/storage"
import { signUpOnWeb } from "../src/web"

export default scenario(
  "Telegram: a photo is understood and stored, and an edited one comes back",
  async ({ stack, page, newPage, newEmail, model, step }) => {
    const { telegram } = stack
    const email = newEmail()
    const chat = await newPage("telegram")
    const lastId = () => telegram.botMessages().at(-1)?.id ?? 0

    step("sign up and link Telegram")
    await signUpOnWeb(page, stack, email)
    await linkTelegram(stack, page, chat, email)

    step("send a red and blue photo and ask about it")
    await model(async () => {
      const before = lastId()
      await telegram.attachImage(
        chat,
        writeRedBluePng(),
        "Which two colours are in this picture? Reply with just the colour names."
      )
      const reply = (await telegram.waitForReply(before, 120_000)).plain
      if (!/red/i.test(reply) || !/blue/i.test(reply)) throw new Error(`Unexpected description: ${reply}`)
    })

    step("the image and its description are in storage")
    const [user] = await queryDb<{ id: string }>(stack, `SELECT id FROM "user" WHERE email = $1`, [email])
    let keys: string[] = []
    for (const deadline = Date.now() + 30_000; Date.now() < deadline; await Bun.sleep(1000)) {
      keys = await listObjects(`images/${user?.id}/`)
      if (keys.some(key => key.endsWith(".json"))) break
    }
    if (keys.length < 2 || !keys.some(key => key.endsWith(".json"))) {
      throw new Error(`Expected an image and its description under images/${user?.id}/, found: ${JSON.stringify(keys)}`)
    }

    step("ask for an edit and get a photo back")
    await model(async () => {
      await Bun.sleep(2500)
      const before = lastId()
      await telegram.say(
        chat,
        "Use your image editing tool to crop that picture to its left half, and send it back to me."
      )
      const photo = await telegram.waitForPhoto(before, 120_000)
      const image = new Bun.Image(await telegram.fetchPhoto(photo))
      const { width, height } = await image.metadata()
      if (Math.abs(width / height - 1) > 0.1)
        throw new Error(`The cropped picture is ${width}×${height}, wanted about square`)
    })
  },
  { llm: true }
)
