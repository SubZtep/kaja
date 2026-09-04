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
      position: fixed; bottom: 20px; right: 20px; width: 44px; height: 44px;
      border-radius: 50%; background: #1a2016; color: #eef2e6; border: 1px solid #37402f; cursor: pointer;
      display: flex; align-items: center; justify-content: center; z-index: 2147483000;
      box-shadow: 0 2px 10px rgba(0,0,0,.35);
      transition: background .15s ease, border-color .15s ease;
    }
    .kaja-widget-bubble:hover { background: #202918; border-color: #6ba85a; }
    .kaja-widget-bubble svg { width: 20px; height: 20px; }
    .kaja-widget-panel {
      position: fixed; bottom: 76px; right: 20px; width: 320px; height: 420px;
      background: #131711; border: 1px solid #37402f; border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,.4);
      display: flex; flex-direction: column; overflow: hidden; z-index: 2147483000;
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Inter", sans-serif; color: #eef2e6;
    }
    .kaja-widget-messages { flex: 1; overflow-y: auto; padding: 12px; }
    .kaja-widget-msg { margin-bottom: 8px; padding: 8px 10px; border-radius: 8px; max-width: 85%; }
    .kaja-widget-msg-user { background: #6ba85a; color: #0d100c; margin-left: auto; }
    .kaja-widget-msg-bot { background: #1a2016; border: 1px solid #37402f; }
    .kaja-widget-msg-question { background: #1a2016; border: 1px solid #6ba85a; }
    .kaja-chat-form { display: flex; border-top: 1px solid #37402f; }
    .kaja-chat-input {
      flex: 1; border: none; background: transparent; color: #eef2e6; padding: 10px; font: inherit;
    }
    .kaja-chat-input::placeholder { color: #9aa88f; }
    .kaja-chat-input:focus { outline: none; }
    .kaja-chat-send { border: none; background: none; color: #8ec478; padding: 0 14px; cursor: pointer; font: inherit; font-weight: 600; }
    .kaja-chat-send:disabled { color: #9aa88f; cursor: default; }
    .kaja-barkochba-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; border-top: 1px solid #37402f; }
    .kaja-barkochba-answer {
      border: 1px solid #37402f; background: #1a2016; color: #eef2e6; border-radius: 8px; padding: 8px; cursor: pointer; font: inherit;
      transition: background .15s ease, border-color .15s ease;
    }
    .kaja-barkochba-answer:hover { background: #202918; border-color: #6ba85a; }
  `
  document.head.appendChild(style)
}

const CHAT_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`

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
  bubble.innerHTML = CHAT_ICON_SVG
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
  let focusInput: () => void = () => {}

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
    focusInput = () => input.focus()
    panel.append(messages, form)
  }

  bubble.addEventListener("click", () => {
    panel.hidden = !panel.hidden
    if (!panel.hidden) focusInput()
  })

  document.body.append(bubble, panel)
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
