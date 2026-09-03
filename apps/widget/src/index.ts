const VISITOR_ID_STORAGE_KEY = "kaja-widget-visitor-id"

function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_ID_STORAGE_KEY)
    if (existing) return existing
    const created = crypto.randomUUID()
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

type TurnResponse = {
  session: string
  status: "completed" | "needs_input" | "needs_approval" | "error"
  message: string
}

function injectStyles() {
  const style = document.createElement("style")
  style.textContent = `
    .kaja-widget-bubble {
      position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px;
      border-radius: 50%; background: #111; color: #fff; border: none; cursor: pointer;
      font: 24px/56px sans-serif; text-align: center; z-index: 2147483000;
      box-shadow: 0 2px 10px rgba(0,0,0,.3);
    }
    .kaja-widget-panel {
      position: fixed; bottom: 88px; right: 20px; width: 320px; height: 420px;
      background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.25);
      display: flex; flex-direction: column; overflow: hidden; z-index: 2147483000;
      font: 14px/1.4 sans-serif; color: #111;
    }
    .kaja-widget-messages { flex: 1; overflow-y: auto; padding: 12px; }
    .kaja-widget-msg { margin-bottom: 8px; padding: 8px 10px; border-radius: 8px; max-width: 85%; }
    .kaja-widget-msg-user { background: #111; color: #fff; margin-left: auto; }
    .kaja-widget-msg-bot { background: #f1f1f1; }
    .kaja-widget-form { display: flex; border-top: 1px solid #eee; }
    .kaja-widget-input { flex: 1; border: none; padding: 10px; font: inherit; }
    .kaja-widget-input:focus { outline: none; }
    .kaja-widget-send { border: none; background: none; padding: 0 14px; cursor: pointer; font: inherit; }
    .kaja-widget-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; border-top: 1px solid #eee; }
    .kaja-widget-answer { border: 1px solid #ddd; background: #fff; border-radius: 8px; padding: 8px; cursor: pointer; font: inherit; }
    .kaja-widget-answer:hover { background: #f1f1f1; }
  `
  document.head.appendChild(style)
}

function appendMessage(container: HTMLElement, text: string, role: "user" | "bot") {
  const el = document.createElement("div")
  el.className = `kaja-widget-msg kaja-widget-msg-${role}`
  el.textContent = text
  container.appendChild(el)
  container.scrollTop = container.scrollHeight
}

/**
 * `document.currentScript` is only reliable for a classic parser-inserted <script> — it's null (or already
 * reset) for a <script> a framework injects into the DOM programmatically, e.g. React rendering it as JSX.
 * Fall back to finding any <script> tag carrying our data attribute.
 */
function findEmbedScript(): HTMLScriptElement | null {
  const current = document.currentScript as HTMLScriptElement | null
  if (current?.dataset.kajaKey) return current
  return document.querySelector<HTMLScriptElement>("script[data-kaja-key]")
}

const BARKOCHBA_ANSWERS = ["Yes", "No", "Sometimes", "Unknown"]

function init() {
  const scriptEl = findEmbedScript()
  const widgetKeyAttr = scriptEl?.dataset.kajaKey
  const baseUrlAttr = scriptEl?.dataset.kajaBaseUrl
  const mode = scriptEl?.dataset.kajaMode
  if (!widgetKeyAttr || !baseUrlAttr) {
    console.error("[kaja-widget] missing data-kaja-key or data-kaja-base-url on the embed <script> tag")
    return
  }
  const widgetKey: string = widgetKeyAttr
  const baseUrl: string = baseUrlAttr

  injectStyles()

  const visitorId = getVisitorId()
  let session: string | undefined

  const bubble = document.createElement("button")
  bubble.className = "kaja-widget-bubble"
  bubble.textContent = "💬"
  bubble.setAttribute("aria-label", "Open chat")

  const panel = document.createElement("div")
  panel.className = "kaja-widget-panel"
  panel.hidden = true

  const messages = document.createElement("div")
  messages.className = "kaja-widget-messages"

  async function sendMessage(message: string) {
    appendMessage(messages, message, "user")
    try {
      const res = await fetch(`${baseUrl}/widget/turn`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-kaja-widget-key": widgetKey },
        body: JSON.stringify({ session, message, visitorId })
      })
      if (res.status === 429) {
        appendMessage(messages, "Too many messages — please wait a moment.", "bot")
        return
      }
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = (await res.json()) as TurnResponse
      session = data.session
      appendMessage(messages, data.message, "bot")
    } catch {
      appendMessage(messages, "Something went wrong. Please try again.", "bot")
    }
  }

  if (mode === "barkochba") {
    const buttons = document.createElement("div")
    buttons.className = "kaja-widget-buttons"
    for (const answer of BARKOCHBA_ANSWERS) {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "kaja-widget-answer"
      button.textContent = answer
      button.addEventListener("click", () => sendMessage(answer))
      buttons.append(button)
    }
    panel.append(messages, buttons)
  } else {
    const form = document.createElement("form")
    form.className = "kaja-widget-form"
    const input = document.createElement("input")
    input.className = "kaja-widget-input"
    input.placeholder = "Ask something…"
    const send = document.createElement("button")
    send.type = "submit"
    send.className = "kaja-widget-send"
    send.textContent = "Send"
    form.append(input, send)

    form.addEventListener("submit", e => {
      e.preventDefault()
      const message = input.value.trim()
      if (!message) return
      input.value = ""
      void sendMessage(message)
    })

    panel.append(messages, form)
  }

  bubble.addEventListener("click", () => {
    panel.hidden = !panel.hidden
  })

  document.body.append(bubble, panel)
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
