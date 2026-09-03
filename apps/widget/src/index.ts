import { createVisitorId, sendWidgetTurn, WidgetTurnRateLimitError } from "./client"

const STATE_STORAGE_KEY = "kaja-widget-state"

type StoredState = { visitorId: string; session?: string }

function loadState(): StoredState {
  try {
    const raw = sessionStorage.getItem(STATE_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { visitorId: createVisitorId() }
}

function saveState(state: StoredState) {
  try {
    sessionStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {}
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
    .kaja-widget-msg-question { background: #eef6ff; border: 1px solid #cfe4ff; }
    .kaja-chat-form { display: flex; border-top: 1px solid #eee; }
    .kaja-chat-input { flex: 1; border: none; padding: 10px; font: inherit; }
    .kaja-chat-input:focus { outline: none; }
    .kaja-chat-send { border: none; background: none; padding: 0 14px; cursor: pointer; font: inherit; }
    .kaja-barkochba-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; border-top: 1px solid #eee; }
    .kaja-barkochba-answer { border: 1px solid #ddd; background: #fff; border-radius: 8px; padding: 8px; cursor: pointer; font: inherit; }
    .kaja-barkochba-answer:hover { background: #f1f1f1; }
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

type WidgetMode = "chat" | "barkochba"

function init() {
  const scriptEl = findEmbedScript()
  const widgetKeyAttr = scriptEl?.dataset.kajaKey
  const baseUrlAttr = scriptEl?.dataset.kajaBaseUrl
  const mode: WidgetMode = scriptEl?.dataset.kajaMode === "barkochba" ? "barkochba" : "chat"
  if (!widgetKeyAttr || !baseUrlAttr) {
    console.error("[kaja-widget] missing data-kaja-key or data-kaja-base-url on the embed <script> tag")
    return
  }
  const widgetKey: string = widgetKeyAttr
  const baseUrl: string = baseUrlAttr

  injectStyles()

  const state = loadState()
  let pending = false

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
    if (pending) return
    pending = true
    setControlsDisabled(true)
    appendMessage(messages, message, "user")
    const thinking = document.createElement("div")
    thinking.className = "kaja-widget-msg kaja-widget-msg-bot"
    thinking.textContent = "…"
    messages.appendChild(thinking)
    messages.scrollTop = messages.scrollHeight
    try {
      const data = await sendWidgetTurn(baseUrl, widgetKey, {
        session: state.session,
        message,
        visitorId: state.visitorId
      })
      state.session = data.session
      saveState(state)
      thinking.textContent = data.message
      const awaitingAnswer = data.status === "needs_input"
      if (awaitingAnswer) thinking.classList.add("kaja-widget-msg-question")
      onAwaitingAnswerChange(awaitingAnswer)
    } catch (error) {
      thinking.textContent =
        error instanceof WidgetTurnRateLimitError ? error.message : "Something went wrong. Please try again."
    } finally {
      pending = false
      setControlsDisabled(false)
    }
  }

  let setControlsDisabled: (disabled: boolean) => void = () => {}
  let onAwaitingAnswerChange: (awaitingAnswer: boolean) => void = () => {}

  if (mode === "barkochba") {
    const buttons = document.createElement("div")
    buttons.className = "kaja-barkochba-buttons"
    for (const answer of BARKOCHBA_ANSWERS) {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "kaja-barkochba-answer"
      button.textContent = answer
      button.addEventListener("click", () => sendMessage(answer))
      buttons.append(button)
    }
    setControlsDisabled = disabled => {
      for (const button of buttons.querySelectorAll("button")) button.disabled = disabled
    }
    panel.append(messages, buttons)
  } else {
    const form = document.createElement("form")
    form.className = "kaja-chat-form"
    const input = document.createElement("input")
    input.className = "kaja-chat-input"
    input.placeholder = "Ask something…"
    const send = document.createElement("button")
    send.type = "submit"
    send.className = "kaja-chat-send"
    send.textContent = "Send"
    form.append(input, send)

    form.addEventListener("submit", e => {
      e.preventDefault()
      const message = input.value.trim()
      if (!message) return
      input.value = ""
      void sendMessage(message)
    })

    onAwaitingAnswerChange = awaitingAnswer => {
      input.placeholder = awaitingAnswer ? "Your answer…" : "Ask something…"
    }

    setControlsDisabled = disabled => {
      input.disabled = disabled
      send.disabled = disabled
    }
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
